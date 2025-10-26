import type { Context } from "hono";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../lib/s3";
import { prisma } from "../lib/prisma";

// ============================================================================
// HELPER FUNCTIONS FOR DOCUMENT PROCESSING
// ============================================================================

// SYNCHRONOUS: Extract text with OCR only (wait for completion)
async function extractTextWithOCR(documentId: string, userId: string): Promise<string | null> {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`� EXTRACTING TEXT: ${documentId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const { performOCR } = await import("./helperFunctions/documentHelper");
    
    const extractedText = await performOCR(documentId, userId);
    
    if (!extractedText) {
      console.log('❌ No text extracted');
      return null;
    }
    
    console.log(`✅ Extracted ${extractedText.length} characters\n`);
    
    return extractedText;
    
  } catch (error) {
    console.error(`❌ OCR extraction failed for ${documentId}:`, error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

// ASYNCHRONOUS: Translate document in background
async function translateDocument(documentId: string, userId: string, extractedText: string) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🌐 TRANSLATING DOCUMENT: ${documentId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const { translateFullDocument } = await import("./helperFunctions/documentHelper");
    
    // Translate to all languages
    console.log('🌐 Translating to all languages...');
    const translationData = await translateFullDocument(extractedText, documentId, userId);
    await prisma.documentTranslation.create({ data: translationData });
    console.log('✅ Translation complete\n');
    
    console.log(`${'='.repeat(60)}`);
    console.log(`✨ TRANSLATION COMPLETE FOR ${documentId}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`❌ Translation failed for ${documentId}:`, error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

async function generateFlashcardsAndQuestions(documentId: string, userId: string) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎴 ASYNC FLASHCARD GENERATION: ${documentId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const { 
      getExistingTerms,
      createQuizData,
      transformToFlashcardData,
      transformToQuestionData,
      createIndexToIdMap 
    } = await import("./helperFunctions/documentHelper");
    
    const { generateCustomFromOCR } = await import("./helperFunctions/customFlashcardHelper");
    
    const document = await prisma.document.findUnique({ 
      where: { id: documentId },
      select: { 
        id: true, 
        extractedText: true, 
        filename: true 
      }
    });
    
    if (!document || !document.extractedText) {
      console.log('❌ No document or extracted text found');
      return;
    }

    const translation = await prisma.documentTranslation.findUnique({
      where: { documentId },
      select: { textEnglish: true }
    });
    
    if (!translation) {
      console.log('❌ No translation found, skipping flashcard generation');
      return;
    }

    console.log('🎴 Generating flashcards and questions from extracted text...');
    const existingDbTermsEnglish = await getExistingTerms(userId);

    const generation = await generateCustomFromOCR({
      ocrText: document.extractedText,
      userId,
      documentId,
      existingDbTermsEnglish,
    });

    const quizData = createQuizData(documentId, userId, document.filename);
    const flashcardData = transformToFlashcardData(generation.terms, documentId, userId);
    const indexToIdMap = createIndexToIdMap(flashcardData);
    const questionData = transformToQuestionData(
      generation.questions,
      indexToIdMap,
      quizData.id,
      userId
    );

    await prisma.$transaction([
      prisma.customQuiz.create({ data: quizData }),
      ...flashcardData.map((data) => prisma.customFlashcard.create({ data })),
      ...questionData.map((data) => prisma.customQuestion.create({ data })),
    ]);

    console.log(`✅ Saved ${flashcardData.length} flashcards and ${questionData.length} questions\n`);
    
    await prisma.document.update({
      where: { id: documentId },
      data: { ocrProcessed: true }
    });
    
    console.log(`${'='.repeat(60)}`);
    console.log(`✨ FLASHCARD GENERATION COMPLETE FOR ${documentId}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`❌ Flashcard generation failed for ${documentId}:`, error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: { ocrProcessed: true }
      });
    } catch (updateError) {
      console.error('Failed to update document status:', updateError);
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
    const { fileKey, filename, fileType, fileSize, extractedText } = await c.req.json();

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
      },
    });

    const ocrSupportedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (ocrSupportedTypes.includes(fileType)) {
      console.log(`🚀 Starting OCR extraction for ${filename}`);
      
      try {
        const extractedText = await extractTextWithOCR(document.id, user.id);
        
        if (extractedText) {
          console.log(`✅ OCR completed for ${document.id}`);
          
          setImmediate(() => {
            translateDocument(document.id, user.id, extractedText)
              .then(() => {
                console.log(`✅ Translation completed for ${document.id}`);
                return generateFlashcardsAndQuestions(document.id, user.id);
              })
              .then(() => {
                console.log(`✅ Flashcards and questions generated for ${document.id}`);
              })
              .catch((err: Error) => {
                console.error(`❌ Background processing error for ${document.id}:`, err);
              });
          });
        } else {
          console.log(`⚠️ No text extracted from ${document.id}`);
        }
      } catch (error) {
        console.error(`❌ OCR extraction error for ${document.id}:`, error);
      }
    }

    return c.json({ 
      document,
      redirectUrl: `/documents/${document.id}/translation`  
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

    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return c.json({ documents });
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

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({ document });
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

    let status: 'processing' | 'completed' | 'error' = 'processing';
    
    if (document.ocrProcessed && hasTranslation && hasFlashcards && hasQuiz) {
      status = 'completed';
    } else if (document.ocrProcessed === false) {
      status = 'processing';
    }

    return c.json({
      status: {
        status,
        hasTranslation,
        hasFlashcards,
        hasQuiz,
        flashcardCount,
        questionCount,
        category: quiz?.category || null,
      },
       translation: document.translation,
      document: {
        id: document.id,
        filename: document.filename,
      }
    });
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
        message: "Translation is being generated. Please wait..."
      });
    }

    if (translation.document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({ translation });
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

    return c.json({
      message: "OCR completed",
      extractedText: extractedText.substring(0, 500) + (extractedText.length > 500 ? "..." : ""),
      textLength: extractedText.length,
    });
  } catch (error) {
    console.error("OCR trigger error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

