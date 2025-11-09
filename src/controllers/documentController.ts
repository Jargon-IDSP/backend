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
import { canAccessQuiz } from "./quizShareController";
import { createNotification } from "../services/notificationService";
import { ocrQueue, flashcardQueue, jobOptions } from "../lib/queue";

const getFromCache = async <T>(key: string): Promise<T | null> => {
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (error) {
    console.error(`Error getting cache for ${key}:`, error);
    return null;
  }
};

const setCache = async <T>(
  key: string,
  data: T,
  ttl: number = 300
): Promise<void> => {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.error(`Error setting cache for ${key}:`, error);
  }
};

export const invalidateCachePattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error(`Error invalidating cache pattern ${pattern}:`, error);
  }
};

export async function extractTextWithOCR(
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

export async function translateDocument(
  documentId: string,
  userId: string,
  extractedText: string
) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🌐 TRANSLATING DOCUMENT: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    const { translateFullDocument, translateUserPreferredLanguage } = await import(
      "./helperFunctions/documentHelper"
    );

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const userLanguage = user?.language || 'english';

    console.log(`🎯 User's preferred language: ${userLanguage}`);
    console.log(`⚡ Translating ${userLanguage} first for fast display...`);

    const quickTranslation = await translateUserPreferredLanguage(
      extractedText,
      userLanguage
    );

    // Cache quick translation and start full translation in parallel
    const [_, translationData] = await Promise.all([
      redisClient.setEx(
        `translation:quick:${documentId}`,
        300, 
        JSON.stringify({
          language: userLanguage,
          text: quickTranslation,
          textEnglish: extractedText,
        })
      ).then(() => {
        console.log(`✅ Quick translation cached for instant display!`);
      }),
      // Start full translation immediately (doesn't need quick translation)
      (async () => {
        console.log("🌐 Starting full translation to all languages...");
        return await translateFullDocument(extractedText, documentId, userId);
      })(),
    ]);
    console.log("✅ Translation data received, saving to database...");
    await prisma.documentTranslation.create({ data: translationData });
    console.log("✅ Translation complete and saved to database\n");

    // Parallelize cache cleanup and invalidation
    await Promise.all([
      redisClient.del(`translation:quick:${documentId}`),
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

export async function generateFlashcardsAndQuestionsOptimized(
  documentId: string,
  userId: string,
  providedCategoryId?: number | null
) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎴 OPTIMIZED FLASHCARD GENERATION: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    // Parallelize user lookup and existing flashcard check
    const [existingFlashcards, user] = await Promise.all([
      prisma.customFlashcard.count({
        where: { documentId },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { language: true },
      }),
    ]);

    if (existingFlashcards > 0) {
      console.log(`⚠️ Flashcards already exist for document ${documentId}, skipping generation`);
      return;
    }

    const userLanguage = user?.language || 'english';

    console.log(`🎯 User's preferred language: ${userLanguage}`);
    console.log(`⚡ Generating flashcards in ${userLanguage} first...`);

    await generateFlashcardsQuick(documentId, userId, userLanguage, providedCategoryId);

    console.log(`✅ Quick flashcards cached!`);
    console.log(`🌐 Continuing with full multilingual flashcards...`);

    await generateFlashcardsFull(documentId, userId, providedCategoryId);

    console.log(`✅ Full flashcards saved to database`);

  } catch (error) {
    console.error(`❌ Optimized flashcard generation failed for ${documentId}:`, error);
    throw error;
  }
}

export async function generateFlashcardsOptimizedLanguages(
  documentId: string,
  userId: string,
  userLanguage: string,
  providedCategoryId?: number | null
) {
  try {
    const { getExistingTerms, createQuizData, transformToFlashcardData, transformToQuestionData, createIndexToIdMap } = await import("./helperFunctions/documentHelper");
    const { extractTermsAndQuestions, translateUserPreferredLanguageOnly, cleanAndDeduplicateTerms, filterAndFillQuestions, makeDedupSet, buildTermsOutput, buildQuestionsOutput } = await import("./helperFunctions/customFlashcardHelper");
    const { GoogleGenAI } = await import("@google/genai");

    if (!process.env.GOOGLE_GENAI_API_KEY) {
      throw new Error("Missing GOOGLE_GENAI_API_KEY");
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, extractedText: true, filename: true, categoryId: true },
    });

    if (!document || !document.extractedText) {
      throw new Error("No document or extracted text");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

    // Get existing terms to avoid duplicates - parallelize these queries
    const [allExistingTerms, termsFromThisDocument] = await Promise.all([
      getExistingTerms(userId),
      prisma.customFlashcard.findMany({
        where: { documentId },
        select: { termEnglish: true },
      }),
    ]);
    const termsToExclude = new Set(termsFromThisDocument.map(t => t.termEnglish.toLowerCase()));
    const existingDbTermsEnglish = allExistingTerms.filter(term => !termsToExclude.has(term.toLowerCase()));

    console.log("📝 Step 1: Extracting terms and questions in English...");

    const extraction = await extractTermsAndQuestions(ai, document.extractedText, existingDbTermsEnglish);
    const dedup = makeDedupSet(existingDbTermsEnglish);
    const top10 = cleanAndDeduplicateTerms(extraction.terms, dedup, 10);

    if (top10.length === 0) {
      throw new Error("No usable terms after deduplication.");
    }

    const qEnglish = filterAndFillQuestions(extraction.questions, top10);
    
    console.log(`✅ Extracted ${top10.length} terms and ${qEnglish.length} questions`);

    // Only translate to user's language (not all 6 languages!)
    console.log(`🌐 Translating to ${userLanguage} only (skipping other 5 languages)...`);
    const translated = await translateUserPreferredLanguageOnly(ai, top10, qEnglish, userLanguage);

    console.log("✅ Translation complete");

    // Determine category
    let categoryId = providedCategoryId || document.categoryId;
    if (!categoryId) {
      const { categorizeDocument } = await import("./helperFunctions/documentHelper");
      categoryId = await categorizeDocument(document.extractedText);
      console.log(`📂 Auto-categorized as: ${categoryId}`);
    }

    const termsOut = buildTermsOutput(top10, translated, documentId, userId);
    const questionsOut = buildQuestionsOutput(qEnglish, translated, documentId, userId, top10);

    const quizData = createQuizData(documentId, userId, document.filename, categoryId);
    const flashcardData = transformToFlashcardData(termsOut, documentId, userId, categoryId);
    const indexToIdMap = createIndexToIdMap(flashcardData);
    const questionData = transformToQuestionData(questionsOut, indexToIdMap, quizData.id, userId, categoryId);

    // Save to database
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { categoryId, ocrProcessed: true }
      }),
      prisma.customQuiz.create({
        data: { ...quizData, visibility: 'PRIVATE' }
      }),
      ...flashcardData.map((data) => prisma.customFlashcard.create({ data })),
      ...questionData.map((data) => prisma.customQuestion.create({ data })),
    ]);

    console.log(`✅ Saved ${flashcardData.length} flashcards and ${questionData.length} questions to database`);

    // Invalidate caches
    await Promise.all([
      invalidateCachePattern(`custom:user:${userId}:*`),
      invalidateCachePattern(`documents:user:${userId}`),
      invalidateCachePattern(`documents:category:${userId}:${categoryId}`)
    ]);

  } catch (error) {
    console.error(`❌ Optimized language flashcard generation failed:`, error);
    throw error;
  }
}

export async function generateFlashcardsQuick(
  documentId: string,
  userId: string,
  userLanguage: string,
  providedCategoryId?: number | null
) {
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
    throw new Error("No document or extracted text");
  }

  const { getExistingTerms } = await import("./helperFunctions/documentHelper");
  const {
    extractTermsAndQuestions,
    translateUserPreferredLanguageOnly,
    cleanAndDeduplicateTerms,
    filterAndFillQuestions,
    makeDedupSet,
    buildTermsOutput,
    buildQuestionsOutput
  } = await import("./helperFunctions/customFlashcardHelper");
  const { GoogleGenAI } = await import("@google/genai");

  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Missing GOOGLE_GENAI_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

  // Parallelize these database queries
  const [allExistingTerms, termsFromThisDocument] = await Promise.all([
    getExistingTerms(userId),
    prisma.customFlashcard.findMany({
      where: { documentId },
      select: { termEnglish: true },
    }),
  ]);
  const termsToExclude = new Set(termsFromThisDocument.map(t => t.termEnglish.toLowerCase()));
  const existingDbTermsEnglish = allExistingTerms.filter(term => !termsToExclude.has(term.toLowerCase()));

  console.log("📝 Step 1: Extracting terms and questions in English...");

  const extraction = await extractTermsAndQuestions(
    ai,
    document.extractedText,
    existingDbTermsEnglish
  );

  const dedup = makeDedupSet(existingDbTermsEnglish);
  const top10 = cleanAndDeduplicateTerms(extraction.terms, dedup, 10);

  if (top10.length === 0) {
    throw new Error("No usable terms after deduplication.");
  }

  const qEnglish = filterAndFillQuestions(extraction.questions, top10);

  console.log(`✅ Extracted ${top10.length} terms and ${qEnglish.length} questions in English`);
  console.log(`🌐 Step 2: Translating to ${userLanguage}...`);

  const translated = await translateUserPreferredLanguageOnly(ai, top10, qEnglish, userLanguage);

  console.log(`✅ Translated to ${userLanguage}`);

  const termsOut = buildTermsOutput(top10, translated, documentId, userId);
  const questionsOut = buildQuestionsOutput(qEnglish, translated, documentId, userId, top10);

  let categoryId: number;
  if (providedCategoryId) {
    categoryId = providedCategoryId;
  } else if (document.categoryId) {
    categoryId = document.categoryId;
  } else {
    const { categorizeDocument } = await import("./helperFunctions/documentHelper");
    categoryId = await categorizeDocument(document.extractedText);
  }

  await redisClient.setEx(
    `flashcards:quick:${documentId}`,
    300,
    JSON.stringify({
      terms: termsOut,
      questions: questionsOut,
      categoryId,
      language: userLanguage,
      rawTerms: top10,
      rawQuestions: qEnglish,
    })
  );

  console.log(`⚡ Quick flashcards cached: ${termsOut.length} terms, ${questionsOut.length} questions (English + ${userLanguage})`);
}

export async function generateFlashcardsFull(
  documentId: string,
  userId: string,
  providedCategoryId?: number | null
) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎴 FULL FLASHCARD GENERATION: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    const {
      getExistingTerms,
      createQuizData,
      transformToFlashcardData,
      transformToQuestionData,
      createIndexToIdMap,
    } = await import("./helperFunctions/documentHelper");

    const {
      extractTermsAndQuestions,
      translateTermsAndQuestions,
      cleanAndDeduplicateTerms,
      filterAndFillQuestions,
      makeDedupSet,
      buildTermsOutput,
      buildQuestionsOutput
    } = await import("./helperFunctions/customFlashcardHelper");
    const { GoogleGenAI } = await import("@google/genai");

    if (!process.env.GOOGLE_GENAI_API_KEY) {
      throw new Error("Missing GOOGLE_GENAI_API_KEY");
    }

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

    const quickCacheKey = `flashcards:quick:${documentId}`;
    const quickCached = await redisClient.get(quickCacheKey);

    let top10: any[];
    let qEnglish: any[];
    let categoryId: number;

    if (quickCached) {
      console.log("⚡ Reusing extracted data from quick cache...");
      const quickData = JSON.parse(quickCached);
      top10 = quickData.rawTerms;
      qEnglish = quickData.rawQuestions;
      categoryId = quickData.categoryId;
    } else {
      console.log("📝 Extracting terms and questions in English...");
      const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

      // Parallelize these database queries
      const [allExistingTerms, termsFromThisDocument] = await Promise.all([
        getExistingTerms(userId),
        prisma.customFlashcard.findMany({
          where: { documentId },
          select: { termEnglish: true },
        }),
      ]);
      const termsToExclude = new Set(termsFromThisDocument.map(t => t.termEnglish.toLowerCase()));
      const existingDbTermsEnglish = allExistingTerms.filter(term => !termsToExclude.has(term.toLowerCase()));

      const extraction = await extractTermsAndQuestions(
        ai,
        document.extractedText,
        existingDbTermsEnglish
      );

      const dedup = makeDedupSet(existingDbTermsEnglish);
      top10 = cleanAndDeduplicateTerms(extraction.terms, dedup, 10);

      if (top10.length === 0) {
        throw new Error("No usable terms after deduplication.");
      }

      qEnglish = filterAndFillQuestions(extraction.questions, top10);

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
    }

    console.log(`🌐 Translating to ALL 6 languages (french, chinese, spanish, tagalog, punjabi, korean)...`);
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

    const translated = await translateTermsAndQuestions(ai, top10, qEnglish);

    console.log("✅ Translation complete for all languages");

    const termsOut = buildTermsOutput(top10, translated, documentId, userId);
    const questionsOut = buildQuestionsOutput(qEnglish, translated, documentId, userId, top10);

    const quizData = createQuizData(documentId, userId, document.filename, categoryId);
    const flashcardData = transformToFlashcardData(
      termsOut,
      documentId,
      userId,
      categoryId
    );
    const indexToIdMap = createIndexToIdMap(flashcardData);
    const questionData = transformToQuestionData(
      questionsOut,
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
      prisma.customQuiz.create({
        data: {
          ...quizData,
          visibility: 'PRIVATE', // Set default visibility to PRIVATE
        }
      }),
      ...flashcardData.map((data) => prisma.customFlashcard.create({ data })),
      ...questionData.map((data) => prisma.customQuestion.create({ data })),
    ]);

    console.log(
      `✅ Saved ${flashcardData.length} flashcards and ${questionData.length} questions to database\n`
    );

    await redisClient.del(quickCacheKey);

    console.log("🔄 Invalidating caches after flashcard generation...");
    await Promise.all([
      invalidateCachePattern(`custom:user:${userId}:*`),
      invalidateCachePattern(`custom:document:${documentId}:*`),
      invalidateCachePattern(`questions:user:${userId}:*`),
      invalidateCachePattern(`questions:document:${documentId}:*`),
      invalidateCachePattern(`quizzes:user:${userId}:*`),
      invalidateCachePattern(`document:status:${documentId}`),
      invalidateCachePattern(`documents:user:${userId}`),
      invalidateCachePattern(`documents:category:${userId}:${categoryId}`),
      invalidateCachePattern(`categories:all:${userId}`),
    ]);
    console.log("✅ Cache invalidation complete");

    // Create notification for document completion
    try {
      await createNotification({
        userId,
        type: "DOCUMENT_READY",
        title: "Document Ready!",
        message: `Your document "${document.filename}" has been processed and is ready to study.`,
        actionUrl: `/learning/documents/${documentId}/study`,
        documentId,
      });
      console.log("📬 Document completion notification created");
    } catch (notifError) {
      console.error("Failed to create notification:", notifError);
      // Don't fail the whole process if notification fails
    }

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
        categoryId: categoryId || 6, 
      },
    });

    // Parallelize cache invalidations
    const cacheInvalidations = [
      invalidateCachePattern(`documents:user:${user.id}`),
    ];
    if (categoryId) {
      cacheInvalidations.push(invalidateCachePattern(`documents:category:${user.id}:${categoryId}`));
    }
    await Promise.all(cacheInvalidations);

    const ocrSupportedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (ocrSupportedTypes.includes(fileType)) {
      console.log(`🚀 Queueing OCR job for ${filename}`);

      try {
        // Queue OCR job (which will handle translation internally)
        await ocrQueue.add(
          `ocr-${document.id}`,
          {
            documentId: document.id,
            userId: user.id,
            fileKey,
            filename,
            categoryId: categoryId || 6,
          },
          {
            ...jobOptions,
            jobId: `ocr-${document.id}`, // Prevent duplicate jobs
          }
        );

        // Don't queue flashcard job here - the OCR worker will queue it after translation completes
        // This eliminates the 5-second delay and polling overhead

        console.log(`📤 Jobs queued for document ${document.id}`);
      } catch (queueError) {
        console.error(`❌ Failed to queue jobs for ${document.id}:`, queueError);
        // Continue anyway - return success but log the error
        // The old setImmediate fallback could be used here if needed
      }
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

export const finalizeDocument = async (c: Context) => {
  try {
    const id = c.req.param("id");
    const { categoryId } = await c.req.json();

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎯 FINALIZE DOCUMENT CALLED: ${id}`);
    console.log(`📁 Category ID: ${categoryId}`);
    console.log(`${"=".repeat(60)}\n`);

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!categoryId || typeof categoryId !== "number") {
      return c.json({ error: "Valid categoryId is required" }, 400);
    }

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        translation: true,
        flashcards: true,
      },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (document.flashcards.length > 0) {
      return c.json({
        message: "Document already finalized",
        status: "already_completed",
        documentId: document.id,
      });
    }

    let ocrReady = !!document.extractedText;
    let attempts = 0;
    const maxAttempts = 60; 

    while (!ocrReady && attempts < maxAttempts) {
      console.log(`⏳ Waiting for OCR... (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const updatedDoc = await prisma.document.findUnique({
        where: { id },
        select: { extractedText: true },
      });

      ocrReady = !!updatedDoc?.extractedText;
      attempts++;

      if (ocrReady) {
        console.log(`✅ OCR ready after ${attempts * 2} seconds`);
        break;
      }
    }

    if (!ocrReady) {
      return c.json({
        error: "OCR timed out. Please try again later.",
        status: "ocr_timeout",
      }, 408);
    }

    console.log(`✅ OCR complete, proceeding with flashcard generation`);

    await prisma.document.update({
      where: { id },
      data: { categoryId },
    });

    console.log(`🎯 Finalizing document ${id} with category ${categoryId}`);

    await generateFlashcardsAndQuestionsOptimized(document.id, user.id, categoryId);

    console.log(`✅ Document ${id} finalized successfully`);

    return c.json({
      message: "Document finalized successfully",
      status: "completed",
      documentId: document.id,
    });
  } catch (error) {
    console.error("Finalize document error:", error);
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

    // Don't cache document access checks - they can change when lesson requests are accepted
    // const cacheKey = `document:${id}:${user.id}`;
    // const cached = await getFromCache<any>(cacheKey);
    // if (cached) {
    //   return c.json(cached);
    // }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    // Check if user is owner or has access via quiz visibility
    const isOwner = document.userId === user.id;

    if (!isOwner) {
      // Check if user has lesson request access (grants access to all documents from this user)
      const lessonRequest = await prisma.lessonRequest.findUnique({
        where: {
          requesterId_recipientId: {
            requesterId: user.id,
            recipientId: document.userId,
          },
        },
      });

      const hasLessonAccess = lessonRequest?.status === "ACCEPTED";

      if (!hasLessonAccess) {
        // Get quizzes for this document
        const quizzes = await prisma.customQuiz.findMany({
          where: { documentId: id },
        });

        // Check if user can access any quiz from this document
        let hasAccess = false;
        for (const quiz of quizzes) {
          if (await canAccessQuiz(user.id, quiz)) {
            hasAccess = true;
            break;
          }
        }

        if (!hasAccess) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }
    }

    const response = { document };

    // Don't cache document access - lesson requests can change access dynamically
    // await setCache(cacheKey, response, 300);

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

    // Check if user is owner or has access via quiz visibility
    const isOwner = document.userId === user.id;

    if (!isOwner) {
      // Get quizzes for this document
      const quizzes = await prisma.customQuiz.findMany({
        where: { documentId: id },
      });

      // Check if user can access any quiz from this document
      let hasAccess = false;
      for (const quiz of quizzes) {
        if (await canAccessQuiz(user.id, quiz)) {
          hasAccess = true;
          break;
        }
      }

      if (!hasAccess) {
        return c.json({ error: "Forbidden" }, 403);
      }
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

    // Don't cache document status access checks - they can change when lesson requests are accepted
    // const cacheKey = `document:status:${id}:${user.id}`;
    // const cached = await getFromCache<any>(cacheKey);
    // if (cached) {
    //   return c.json(cached);
    // }

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

    // Check if user is owner or has access via quiz visibility
    const isOwner = document.userId === user.id;

    if (!isOwner) {
      // Check if user has lesson request access (grants access to all documents from this user)
      const lessonRequest = await prisma.lessonRequest.findUnique({
        where: {
          requesterId_recipientId: {
            requesterId: user.id,
            recipientId: document.userId,
          },
        },
      });

      const hasLessonAccess = lessonRequest?.status === "ACCEPTED";

      if (!hasLessonAccess) {
        // Get quizzes for this document
        const quizzes = await prisma.customQuiz.findMany({
          where: { documentId: id },
        });

        // Check if user can access any quiz from this document
        let hasAccess = false;
        for (const quiz of quizzes) {
          if (await canAccessQuiz(user.id, quiz)) {
            hasAccess = true;
            break;
          }
        }

        if (!hasAccess) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }
    }

    const quickCacheKey = `flashcards:quick:${id}`;
    const quickCached = await redisClient.get(quickCacheKey);
    const hasQuickCache = !!quickCached;

    const translationQuickCacheKey = `translation:quick:${id}`;
    const translationQuickCached = await redisClient.get(translationQuickCacheKey);
    const hasQuickTranslation = !!translationQuickCached;

    let quickFlashcardCount = 0;
    let quickQuestionCount = 0;
    let quickCategoryId: number | null = null;

    if (hasQuickCache) {
      const quickData = JSON.parse(quickCached);
      quickFlashcardCount = quickData.terms?.length || 0;
      quickQuestionCount = quickData.questions?.length || 0;
      quickCategoryId = quickData.categoryId || null;
    }

    const hasTranslation = !!document.translation || hasQuickTranslation;
    const flashcardCount = document.flashcards.length;
    const hasFlashcards = flashcardCount > 0;

    const quiz = document.customQuizzes[0];
    const questionCount = quiz?.questions.length || 0;
    const hasQuiz = !!quiz && questionCount > 0;

    const hasFlashcardsOrQuickCache = hasFlashcards || (hasQuickCache && quickFlashcardCount > 0);
    const hasQuizInDb = hasQuiz; 

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
        hasFlashcards: hasFlashcardsOrQuickCache,  
        hasQuiz: hasQuizInDb, 
        flashcardCount: hasFlashcards ? flashcardCount : quickFlashcardCount,
        questionCount: hasQuiz ? questionCount : quickQuestionCount,
        categoryId: quiz?.categoryId || quickCategoryId || null,
        quickTranslation: hasQuickCache && !hasFlashcards, 
      },
      translation: document.translation,
      document: {
        id: document.id,
        filename: document.filename,
        userId: document.userId,
      },
    };

    // Don't cache document status - lesson requests can change access dynamically
    // const ttl = status === "completed" ? 300 : 5;
    // await setCache(cacheKey, response, ttl);

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

    // Check quick cache first (user's preferred language, ready in ~10s)
    const quickCacheKey = `translation:quick:${id}`;
    const quickCached = await redisClient.get(quickCacheKey);
    if (quickCached) {
      const quickData = JSON.parse(quickCached);
      console.log(`⚡ Serving quick translation from cache for ${id}`);

      // Fetch document to get filename
      const document = await prisma.document.findUnique({
        where: { id },
        select: { id: true, userId: true, filename: true },
      });

      if (!document) {
        return c.json({ error: "Document not found" }, 404);
      }

      // Check if user is owner or has access via quiz visibility
      const isOwner = document.userId === user.id;

      if (!isOwner) {
        // Get quizzes for this document
        const quizzes = await prisma.customQuiz.findMany({
          where: { documentId: id },
        });

        // Check if user can access any quiz from this document
        let hasAccess = false;
        for (const quiz of quizzes) {
          if (await canAccessQuiz(user.id, quiz)) {
            hasAccess = true;
            break;
          }
        }

        if (!hasAccess) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }

      // Return in same format as DB translation
      const translationData: any = {
        id: 'quick-' + id,
        documentId: id,
        userId: user.id,
        textEnglish: quickData.textEnglish,
        textFrench: '',
        textChinese: '',
        textSpanish: '',
        textTagalog: '',
        textPunjabi: '',
        textKorean: '',
        document: {
          id: document.id,
          userId: document.userId,
          filename: document.filename,
        },
      };

      // Set the user's preferred language
      const langKey = `text${quickData.language.charAt(0).toUpperCase() + quickData.language.slice(1)}`;
      translationData[langKey] = quickData.text;

      return c.json({
        translation: translationData,
        quickTranslation: true, // Flag to indicate this is partial
      });
    }

    // Check regular cache
    const cacheKey = `document:translation:${id}:${user.id}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    // Check database for full translation
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

      // Check if user is owner or has access via quiz visibility
      const isOwner = document.userId === user.id;

      if (!isOwner) {
        // Get quizzes for this document
        const quizzes = await prisma.customQuiz.findMany({
          where: { documentId: id },
        });

        // Check if user can access any quiz from this document
        let hasAccess = false;
        for (const quiz of quizzes) {
          if (await canAccessQuiz(user.id, quiz)) {
            hasAccess = true;
            break;
          }
        }

        if (!hasAccess) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }

      return c.json({
        translation: null,
        processing: true,
        message: "Translation is being generated. Please wait...",
      });
    }

    // Check if user is owner or has access via quiz visibility
    const isOwner = translation.document.userId === user.id;

    if (!isOwner) {
      // Get quizzes for this document
      const quizzes = await prisma.customQuiz.findMany({
        where: { documentId: id },
      });

      // Check if user can access any quiz from this document
      let hasAccess = false;
      for (const quiz of quizzes) {
        if (await canAccessQuiz(user.id, quiz)) {
          hasAccess = true;
          break;
        }
      }

      if (!hasAccess) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    const response = { translation };

    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error) {
    console.error("Get document translation error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDocumentJobStatus = async (c: Context) => {
  try {
    const id = c.req.param("id");
    const user = c.get("user");
    
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Try to get job status, but handle Redis being unavailable
    let ocrJob = null;
    let translationJob = null;
    let flashcardJob = null;

    try {
      const results = await Promise.allSettled([
        ocrQueue.getJob(`ocr-${id}`),
        (await import("../lib/queue")).translationQueue.getJob(`translate-${id}`),
        flashcardQueue.getJob(`flashcards-${id}`),
      ]);

      if (results[0].status === 'fulfilled') ocrJob = results[0].value;
      if (results[1].status === 'fulfilled') translationJob = results[1].value;
      if (results[2].status === 'fulfilled') flashcardJob = results[2].value;
    } catch (queueError) {
      // Redis unavailable - return empty job status
      console.warn('⚠️  Cannot fetch job status - Redis unavailable');
      return c.json({
        ocr: null,
        translation: null,
        flashcards: null,
        redisUnavailable: true,
      });
    }

    const getJobInfo = async (job: any) => {
      if (!job) return null;
      
      try {
        const state = await job.getState();
        return {
          id: job.id,
          state,
          progress: job.progress || 0,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        };
      } catch {
        return null;
      }
    };

    return c.json({
      ocr: await getJobInfo(ocrJob),
      translation: await getJobInfo(translationJob),
      flashcards: await getJobInfo(flashcardJob),
    });
  } catch (error) {
    console.error("Get job status error:", error);
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
