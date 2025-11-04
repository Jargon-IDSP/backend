import type { Context } from "hono";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../lib/s3";
import { prisma } from "../lib/prisma";
import redisClient from "../lib/redis";

// Helper function to get from cache
const getFromCache = async <T>(key: string): Promise<T | null> => {
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      console.log(`✅ Cache HIT: ${key}`);
      return JSON.parse(cached) as T;
    }
    console.log(`❌ Cache MISS: ${key}`);
    return null;
  } catch (error) {
    console.error(`Error getting cache for ${key}:`, error);
    return null;
  }
};

// Helper function to set cache
const setCache = async <T>(
  key: string,
  data: T,
  ttl: number = 300
): Promise<void> => {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(data));
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error(`Error setting cache for ${key}:`, error);
  }
};

// Helper function to invalidate cache by pattern
const invalidateCachePattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(
        `🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`
      );
    }
  } catch (error) {
    console.error(`Error invalidating cache pattern ${pattern}:`, error);
  }
};

async function extractTextWithOCR(
  documentId: string,
  userId: string
): Promise<string | null> {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📄 EXTRACTING TEXT: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    const { performOCR } = await import("./helperFunctions/documentHelper");

    const extractedText = await performOCR(documentId, userId);

    if (!extractedText) {
      console.log("❌ No text extracted");
      return null;
    }

    console.log(`✅ Extracted ${extractedText.length} characters\n`);

    return extractedText;
  } catch (error) {
    console.error(`❌ OCR extraction failed for ${documentId}:`, error);
    console.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    throw error;
  }
}

async function translateDocument(
  documentId: string,
  userId: string,
  extractedText: string
) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🌐 TRANSLATING DOCUMENT: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    const { translateFullDocument } = await import(
      "./helperFunctions/documentHelper"
    );

    console.log("🌐 Translating to all languages...");
    const translationData = await translateFullDocument(
      extractedText,
      documentId,
      userId
    );
    await prisma.documentTranslation.create({ data: translationData });
    console.log("✅ Translation complete\n");

    // Invalidate translation and status caches immediately for real-time updates
    await Promise.all([
      invalidateCachePattern(`document:translation:${documentId}:*`),
      invalidateCachePattern(`document:status:${documentId}`),
    ]);

    console.log(`${"=".repeat(60)}`);
    console.log(`✨ TRANSLATION COMPLETE FOR ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error(`❌ Translation failed for ${documentId}:`, error);
    console.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    throw error;
  }
}

async function generateFlashcardsAndQuestions(
  documentId: string,
  userId: string,
  providedCategoryId?: number | null
) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎴 ASYNC FLASHCARD GENERATION: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    const {
      getExistingTerms,
      createQuizData,
      transformToFlashcardData,
      transformToQuestionData,
      createIndexToIdMap,
    } = await import("./helperFunctions/documentHelper");

    const { generateCustomFromOCR } = await import(
      "./helperFunctions/customFlashcardHelper"
    );

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        extractedText: true,
        filename: true,
        categoryId: true,
      },
    });

    if (!document || !document.extractedText) {
      console.log("❌ No document or extracted text found");
      return;
    }

    const translation = await prisma.documentTranslation.findUnique({
      where: { documentId },
      select: { textEnglish: true },
    });

    if (!translation) {
      console.log("❌ No translation found, skipping flashcard generation");
      return;
    }

    console.log(
      "🎴 Generating flashcards and questions from extracted text..."
    );
    const existingDbTermsEnglish = await getExistingTerms(userId);

    const generation = await generateCustomFromOCR({
      ocrText: document.extractedText,
      userId,
      documentId,
      existingDbTermsEnglish,
    });

    // Use provided categoryId if available, otherwise use AI categorization
    let categoryId: number;
    if (providedCategoryId) {
      categoryId = providedCategoryId;
      console.log(`📁 Using user-selected category ID: ${categoryId}`);
    } else if (document.categoryId) {
      categoryId = document.categoryId;
      console.log(`📁 Using existing category ID: ${categoryId}`);
    } else {
      const { categorizeDocument } = await import("./helperFunctions/documentHelper");
      categoryId = await categorizeDocument(document.extractedText);
      console.log(`📁 AI categorized document as category ID: ${categoryId}`);
    }

    const quizData = createQuizData(documentId, userId, document.filename, categoryId);
    const flashcardData = transformToFlashcardData(
      generation.terms,
      documentId,
      userId,
      categoryId
    );
    const indexToIdMap = createIndexToIdMap(flashcardData);
    const questionData = transformToQuestionData(
      generation.questions,
      indexToIdMap,
      quizData.id,
      userId,
      categoryId
    );

    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { categoryId, ocrProcessed: true }
      }),
      prisma.customQuiz.create({ data: quizData }),
      ...flashcardData.map((data) => prisma.customFlashcard.create({ data })),
      ...questionData.map((data) => prisma.customQuestion.create({ data })),
    ]);

    console.log(
      `✅ Saved ${flashcardData.length} flashcards and ${questionData.length} questions\n`
    );

    // Invalidate all related caches after flashcard generation
    console.log("🔄 Invalidating caches after flashcard generation...");
    await Promise.all([
      invalidateCachePattern(`custom:user:${userId}:*`),
      invalidateCachePattern(`custom:document:${documentId}:*`),
      invalidateCachePattern(`questions:user:${userId}:*`),
      invalidateCachePattern(`questions:document:${documentId}:*`),
      invalidateCachePattern(`quizzes:user:${userId}:*`),
      invalidateCachePattern(`document:status:${documentId}`),
      invalidateCachePattern(`documents:user:${userId}`),
      invalidateCachePattern(`documents:category:${userId}:${categoryId}`), // Fixed: include userId in pattern
      invalidateCachePattern(`categories:all:${userId}`), // Invalidate categories to update document counts
    ]);
    console.log("✅ Cache invalidation complete");

    console.log(`${"=".repeat(60)}`);
    console.log(`✨ FLASHCARD GENERATION COMPLETE FOR ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error(`❌ Flashcard generation failed for ${documentId}:`, error);
    console.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack trace"
    );

    try {
      await prisma.document.update({
        where: { id: documentId },
        data: { ocrProcessed: true },
      });
    } catch (updateError) {
      console.error("Failed to update document status:", updateError);
    }
  }
}

export const getUploadUrl = async (c: Context) => {
  try {
    const { filename, type } = await c.req.json();

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const key = `documents/${user.id}/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      ContentType: type,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return c.json({ uploadUrl, key });
  } catch (error) {
    console.error("Upload URL error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const saveDocument = async (c: Context) => {
  try {
    const { fileKey, filename, fileType, fileSize, extractedText, categoryId } =
      await c.req.json();

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.create({
      data: {
        filename,
        fileKey,
        fileUrl: fileKey,
        fileType,
        fileSize: fileSize || null,
        extractedText: extractedText || null,
        ocrProcessed: false,
        userId: user.id,
        categoryId: categoryId || 6, // Default to General category (ID: 6)
      },
    });

    // Invalidate user's document list cache
    await invalidateCachePattern(`documents:user:${user.id}`);
    if (categoryId) {
      await invalidateCachePattern(`documents:category:${user.id}:${categoryId}`);
    }

    const ocrSupportedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (ocrSupportedTypes.includes(fileType)) {
      console.log(`🚀 Starting background OCR extraction for ${filename}`);

      // Run OCR and all processing fully asynchronously without blocking the response
      setImmediate(() => {
        extractTextWithOCR(document.id, user.id)
          .then(async (extractedText) => {
            if (!extractedText) {
              console.log(`⚠️ No text extracted from ${document.id}`);
              return;
            }

            console.log(`✅ OCR completed for ${document.id}`);

            // Invalidate status cache after OCR completes
            await invalidateCachePattern(`document:status:${document.id}`);

            return translateDocument(document.id, user.id, extractedText);
          })
          .then(async () => {
            console.log(`✅ Translation completed for ${document.id}`);
            // Invalidate status cache to show translation is complete
            await invalidateCachePattern(`document:status:${document.id}`);
            return generateFlashcardsAndQuestions(document.id, user.id, categoryId);
          })
          .then(async () => {
            console.log(
              `✅ Flashcards and questions generated for ${document.id}`
            );
            // Final invalidation to show everything is complete
            await invalidateCachePattern(`document:status:${document.id}`);
          })
          .catch((err: Error) => {
            console.error(
              `❌ Background processing error for ${document.id}:`,
              err
            );
          });
      });
    }

    return c.json({
      document,
      redirectUrl: `/profile`,
      documentId: document.id,
    });
  } catch (error) {
    console.error("Save document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getUserDocuments = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const cacheKey = `documents:user:${user.id}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            flashcards: true,
            customQuizzes: true,
          },
        },
      },
    });

    const fullyProcessedDocuments = documents
      .filter(doc => doc._count.flashcards > 0 && doc._count.customQuizzes > 0)
      .map(({ _count, ...doc }) => doc);

    const response = { documents: fullyProcessedDocuments };

    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error) {
    console.error("Get documents error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDocument = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const cacheKey = `document:${id}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      if (cached.document.userId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
      }
      return c.json(cached);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const response = { document };

    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error) {
    console.error("Get document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDownloadUrl = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return c.json({ downloadUrl });
  } catch (error) {
    console.error("Get download URL error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const deleteDocument = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    await s3.send(deleteCommand);

    await prisma.document.delete({
      where: { id },
    });

    console.log("🔄 Invalidating caches after document deletion...");
    await Promise.all([
      invalidateCachePattern(`documents:user:${user.id}`),
      invalidateCachePattern(`document:${id}`),
      invalidateCachePattern(`document:status:${id}`),
      invalidateCachePattern(`document:translation:${id}:*`),
      invalidateCachePattern(`custom:document:${id}:*`),
      invalidateCachePattern(`questions:document:${id}:*`),
    ]);

    return c.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDocumentStatus = async (c: Context) => {
  try {
    const id = c.req.param("id");
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const cacheKey = `document:status:${id}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      if (cached.document.userId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
      }
      return c.json(cached);
    }

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        translation: true,
        flashcards: true,
        customQuizzes: {
          include: {
            questions: true,
          },
        },
      },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const hasTranslation = !!document.translation;
    const flashcardCount = document.flashcards.length;
    const hasFlashcards = flashcardCount > 0;

    const quiz = document.customQuizzes[0];
    const questionCount = quiz?.questions.length || 0;
    const hasQuiz = !!quiz && questionCount > 0;

    let status: "processing" | "completed" | "error" = "processing";

    if (document.ocrProcessed && hasTranslation && hasFlashcards && hasQuiz) {
      status = "completed";
    } else if (document.ocrProcessed === false) {
      status = "processing";
    }

    const response = {
      status: {
        status,
        hasTranslation,
        hasFlashcards,
        hasQuiz,
        flashcardCount,
        questionCount,
        categoryId: quiz?.categoryId || null,
      },
      translation: document.translation,
      document: {
        id: document.id,
        filename: document.filename,
        userId: document.userId, 
      },
    };

    const ttl = status === "completed" ? 300 : 5;
    await setCache(cacheKey, response, ttl);

    return c.json(response);
  } catch (error) {
    console.error("Get document status error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDocumentTranslation = async (c: Context) => {
  try {
    const id = c.req.param("id");
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const cacheKey = `document:translation:${id}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      if (cached.translation?.document?.userId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
      }
      return c.json(cached);
    }

    const translation = await prisma.documentTranslation.findUnique({
      where: { documentId: id },
      include: {
        document: {
          include: {
            customQuizzes: {
              include: {
                questions: true,
              },
            },
          },
        },
      },
    });

    if (!translation) {
      const document = await prisma.document.findUnique({
        where: { id },
      });

      if (!document) {
        return c.json({ error: "Document not found" }, 404);
      }

      if (document.userId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
      }

      return c.json({
        translation: null,
        processing: true,
        message: "Translation is being generated. Please wait...",
      });
    }

    if (translation.document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const response = { translation };

    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error) {
    console.error("Get document translation error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const triggerOCR = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    console.log("=== Manual OCR Trigger ===");

    const { performOCR } = await import("./helperFunctions/documentHelper");
    const extractedText = await performOCR(id, user.id);

    if (!extractedText) {
      return c.json({ error: "OCR failed" }, 500);
    }

    await Promise.all([
      invalidateCachePattern(`document:${id}`),
      invalidateCachePattern(`document:status:${id}`),
      invalidateCachePattern(`documents:user:${user.id}`),
    ]);

    return c.json({
      message: "OCR completed",
      extractedText:
        extractedText.substring(0, 500) +
        (extractedText.length > 500 ? "..." : ""),
      textLength: extractedText.length,
    });
  } catch (error) {
    console.error("OCR trigger error:", error);
    return c.json({ error: String(error) }, 500);
  }
};
