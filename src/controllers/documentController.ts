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

// Helper function to check if user can access a document based on owner's privacy
async function canAccessDocument(userId: string, document: { userId: string; user?: { defaultPrivacy: string } | null }, documentId: string): Promise<boolean> {
  try {
    // Owner always has access
    if (document.userId === userId) {
      return true;
    }

    // If no user data, deny access
    if (!document.user) {
      console.error('canAccessDocument: document.user is null/undefined', { documentId, userId });
      return false;
    }

    const ownerPrivacy = document.user.defaultPrivacy;

    // PUBLIC: Everyone can access
    if (ownerPrivacy === "PUBLIC") {
      return true;
    }

    // FRIENDS: Check if mutually following
    if (ownerPrivacy === "FRIENDS") {
      const [yourFollow, theirFollow] = await Promise.all([
        prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: userId,
              followingId: document.userId,
            }
          }
        }),
        prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: document.userId,
              followingId: userId,
            }
          }
        })
      ]);

      return !!yourFollow && yourFollow.status === "FOLLOWING" && !!theirFollow && theirFollow.status === "FOLLOWING";
    }

    // PRIVATE: Check if user has specific quiz share access
    if (ownerPrivacy === "PRIVATE") {
      const quizShares = await prisma.customQuiz.findFirst({
        where: {
          documentId,
          sharedWith: {
            some: {
              sharedWithUserId: userId,
              status: "ACCEPTED"
            }
          }
        }
      });

      return !!quizShares;
    }

    return false;
  } catch (error) {
    console.error('canAccessDocument error:', error, { documentId, userId });
    return false;
  }
}

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
  extractedText: string,
  preloadedUserLanguage?: string // Optional: if provided, skip DB query
) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🌐 TRANSLATING DOCUMENT: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    const { translateFullDocument, translateUserPreferredLanguage } = await import(
      "./helperFunctions/documentHelper"
    );

    // Use preloaded user language if provided, otherwise fetch from DB
    let userLanguage: string;
    if (preloadedUserLanguage) {
      userLanguage = preloadedUserLanguage;
      console.log(`✅ Using preloaded user language: ${userLanguage}`);
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { language: true },
      });
      userLanguage = user?.language || 'english';
    }

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
  providedCategoryId?: number | null,
  preloadedUserLanguage?: string // Optional: if provided, skip DB query
) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎴 OPTIMIZED FLASHCARD GENERATION: ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    // Check if flashcards already exist
    const existingFlashcards = await prisma.customFlashcard.count({
      where: { documentId },
    });

    if (existingFlashcards > 0) {
      console.log(`⚠️ Flashcards already exist for document ${documentId}, skipping generation`);
      return;
    }

    // Use preloaded user language if provided, otherwise fetch from DB
    let userLanguage: string;
    if (preloadedUserLanguage) {
      userLanguage = preloadedUserLanguage;
      console.log(`✅ Using preloaded user language: ${userLanguage}`);
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { language: true },
      });
      userLanguage = user?.language || 'english';
    }

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
        data: quizData
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

  const { getExistingTerms, translateUserPreferredLanguage } = await import("./helperFunctions/documentHelper");
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

  console.log("🚀 PARALLEL EXECUTION: Starting term extraction AND quick document translation...");

  // PARALLEL: Extract flashcard terms AND translate document (both only need OCR text!)
  const [extraction, quickDocTranslation] = await Promise.all([
    // Path A: Extract terms and questions
    (async () => {
      console.log("📝 Path A: Extracting terms and questions in English...");
      return await extractTermsAndQuestions(
        ai,
        document.extractedText,
        existingDbTermsEnglish
      );
    })(),

    // Path B: Quick translate document (if not already cached)
    (async () => {
      const quickCacheKey = `translation:quick:${documentId}`;
      const cached = await redisClient.get(quickCacheKey);
      if (cached) {
        console.log("⚡ Path B: Document translation already cached, skipping");
        return null;
      }

      console.log(`🌐 Path B: Translating document to ${userLanguage}...`);
      const translation = await translateUserPreferredLanguage(
        document.extractedText,
        userLanguage
      );

      // Cache quick document translation
      await redisClient.setEx(
        quickCacheKey,
        300,
        JSON.stringify({
          language: userLanguage,
          text: translation,
          textEnglish: document.extractedText,
        })
      );

      console.log(`✅ Path B: Quick document translation cached!`);
      return translation;
    })()
  ]);

  const dedup = makeDedupSet(existingDbTermsEnglish);
  const top10 = cleanAndDeduplicateTerms(extraction.terms, dedup, 10);

  if (top10.length === 0) {
    throw new Error("No usable terms after deduplication.");
  }

  const qEnglish = filterAndFillQuestions(extraction.questions, top10);

  console.log(`✅ Extracted ${top10.length} terms and ${qEnglish.length} questions in English`);

  // Determine category early (before translation) so we can cache it
  let categoryId: number;
  if (providedCategoryId) {
    categoryId = providedCategoryId;
  } else if (document.categoryId) {
    categoryId = document.categoryId;
  } else {
    const { categorizeDocument } = await import("./helperFunctions/documentHelper");
    categoryId = await categorizeDocument(document.extractedText);
  }

  // Cache extraction results separately (longer TTL, survives quick->full transition)
  const crypto = await import("crypto");
  const textHash = crypto.createHash("md5").update(document.extractedText.slice(0, 6000)).digest("hex");
  const extractionCacheKey = `extraction:${textHash}`;
  const extractionDocCacheKey = `extraction:doc:${documentId}`;  // Optimized: cache by doc ID too

  const cacheData = JSON.stringify({
    rawTerms: top10,
    rawQuestions: qEnglish,
    categoryId,
    documentId,
    extractedText: document.extractedText,  // Store text so Full generation can skip DB fetch
    filename: document.filename,
  });

  // Store in both caches (hash-based and doc-id-based) for optimal reuse
  await Promise.all([
    redisClient.setEx(extractionCacheKey, 3600, cacheData),  // Hash-based (dedup across docs)
    redisClient.setEx(extractionDocCacheKey, 3600, cacheData),  // Doc-id-based (fast lookup)
  ]);

  console.log(`💾 Extraction cached separately for reuse: ${extractionCacheKey}`);
  console.log(`🌐 Translating flashcards to ${userLanguage}...`);

  const translated = await translateUserPreferredLanguageOnly(ai, top10, qEnglish, userLanguage);

  console.log(`✅ Flashcards translated to ${userLanguage}`);

  const termsOut = buildTermsOutput(top10, translated, documentId, userId);
  const questionsOut = buildQuestionsOutput(qEnglish, translated, documentId, userId, top10);

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

    // Optimized: Check doc-id cache first to potentially skip DB fetch
    const extractionDocCacheKey = `extraction:doc:${documentId}`;
    const docCached = await redisClient.get(extractionDocCacheKey);

    let document: { id: string; extractedText: string; filename: string; categoryId: number | null };
    let extractionCached: string | null;

    if (docCached) {
      console.log("⚡ Found extraction cache by document ID - skipping DB fetch!");
      const cached = JSON.parse(docCached);
      document = {
        id: cached.documentId,
        extractedText: cached.extractedText,
        filename: cached.filename,
        categoryId: cached.categoryId,
      };
      extractionCached = docCached;  // Reuse the same cache data
    } else {
      // Cache miss - fetch from DB
      const dbDocument = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          extractedText: true,
          filename: true,
          categoryId: true,
        },
      });

      if (!dbDocument || !dbDocument.extractedText) {
        console.log("❌ No document or extracted text found");
        return;
      }

      document = dbDocument;

      // Check hash-based extraction cache
      const crypto = await import("crypto");
      const textHash = crypto.createHash("md5").update(document.extractedText.slice(0, 6000)).digest("hex");
      const extractionCacheKey = `extraction:${textHash}`;
      extractionCached = await redisClient.get(extractionCacheKey);
    }

    let top10: any[];
    let qEnglish: any[];
    let categoryId: number;

    if (extractionCached) {
      console.log("⚡ Reusing extracted data from extraction cache (faster!)...");
      const extractionData = JSON.parse(extractionCached);
      top10 = extractionData.rawTerms;
      qEnglish = extractionData.rawQuestions;
      categoryId = providedCategoryId || extractionData.categoryId;
    } else {
      // Fallback to quick cache (5 minute TTL)
      const quickCacheKey = `flashcards:quick:${documentId}`;
      const quickCached = await redisClient.get(quickCacheKey);

      if (quickCached) {
        console.log("⚡ Reusing extracted data from quick cache...");
        const quickData = JSON.parse(quickCached);
        top10 = quickData.rawTerms;
        qEnglish = quickData.rawQuestions;
        categoryId = providedCategoryId || quickData.categoryId;
      } else {
        console.log("📝 Extracting terms and questions in English (cache miss)...");
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

        // Cache the extraction for next time
        await redisClient.setEx(
          extractionCacheKey,
          3600, // 1 hour TTL
          JSON.stringify({
            rawTerms: top10,
            rawQuestions: qEnglish,
            categoryId,
            documentId,
          })
        );
        console.log(`💾 Extraction cached for future use: ${extractionCacheKey}`);
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

    // Single transaction (OLD FAST VERSION) - no batching needed for 10 items
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { categoryId, ocrProcessed: true }
      }),
      prisma.customQuiz.create({
        data: quizData
      }),
      ...flashcardData.map((data) => prisma.customFlashcard.create({ data })),
      ...questionData.map((data) => prisma.customQuestion.create({ data })),
    ]);

    console.log(`✅ Saved ${flashcardData.length} flashcards and ${questionData.length} questions to database`);

    console.log("🔄 Invalidating caches after flashcard generation...");
    await Promise.all([
      invalidateCachePattern(`custom:user:${userId}:*`),
      invalidateCachePattern(`documents:user:${userId}`),
      invalidateCachePattern(`documents:category:${userId}:${categoryId}`)
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
      include: {
        user: {
          select: {
            id: true,
            defaultPrivacy: true,
          }
        }
      }
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    // Check if user can access this document
    const hasAccess = await canAccessDocument(user.id, document, id);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
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
      include: {
        user: {
          select: {
            id: true,
            defaultPrivacy: true,
          }
        }
      }
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    // Check if user can access this document
    const hasAccess = await canAccessDocument(user.id, document, id);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return c.json({ success: true, data: { downloadUrl } });
  } catch (error) {
    console.error("Get download URL error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const updateDocument = async (c: Context) => {
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

    const body = await c.req.json();
    const { name, categoryId } = body;

    // Build update data object
    const updateData: { filename?: string; categoryId?: number } = {};
    const quizUpdateData: { name?: string; categoryId?: number } = {};

    // Only process name if it's provided and not empty
    if (name !== undefined && name !== null && name !== '') {
      if (typeof name !== 'string' || !name.trim()) {
        return c.json({ error: "Invalid document name" }, 400);
      }
      updateData.filename = name.trim();
      quizUpdateData.name = name.trim();
    }

    if (categoryId !== undefined) {
      if (typeof categoryId !== 'number') {
        return c.json({ error: "Invalid categoryId" }, 400);
      }

      console.log(`📁 Updating document category: documentId=${id}, categoryId=${categoryId}, userId=${user.id}`);

      // Default category IDs (1-6): Safety, Technical, Training, Workplace, Professional, General
      // These are always available to all users
      const DEFAULT_CATEGORY_IDS = [1, 2, 3, 4, 5, 6];
      const isDefaultCategoryId = DEFAULT_CATEGORY_IDS.includes(categoryId);

      // If it's a default category ID, allow it immediately
      if (isDefaultCategoryId) {
        console.log(`✅ Allowing default category: ${categoryId}`);
        updateData.categoryId = categoryId;
        quizUpdateData.categoryId = categoryId;
      } else {
        // For custom categories, verify they exist and belong to the user
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
        });

        if (!category) {
          console.error(`❌ Category not found: categoryId=${categoryId}`);
          return c.json({ error: "Category not found" }, 404);
        }

        console.log(`📋 Category found: id=${category.id}, name=${category.name}, userId=${category.userId}, isDefault=${category.isDefault}, requestingUserId=${user.id}`);

        // Check if it's marked as default or belongs to the user
        const isDefaultCategory = category.isDefault === true;
        const isUserCategory = category.userId === user.id;

        console.log(`🔍 Validation: isDefaultCategory=${isDefaultCategory}, isUserCategory=${isUserCategory}, category.userId=${category.userId}, user.id=${user.id}`);

        if (!isDefaultCategory && !isUserCategory) {
          console.error(`❌ Category access denied: categoryId=${categoryId}, userId=${user.id}, category.userId=${category.userId}, isDefault=${category.isDefault}`);
          return c.json({ error: "You can only use your own categories" }, 403);
        }

        console.log(`✅ Allowing category: ${categoryId}`);
        updateData.categoryId = categoryId;
        quizUpdateData.categoryId = categoryId;
      }
    }

    // If no updates provided, return error
    if (Object.keys(updateData).length === 0) {
      return c.json({ error: "No valid updates provided" }, 400);
    }

    // Get old categoryId for cache invalidation
    const oldCategoryId = document.categoryId;

    // Build transaction array
    const transactionOps: any[] = [
      prisma.document.update({
        where: { id },
        data: updateData,
      }),
    ];

    // Only update quiz if there are changes to make
    if (Object.keys(quizUpdateData).length > 0) {
      transactionOps.push(
        prisma.customQuiz.updateMany({
          where: { documentId: id },
          data: quizUpdateData,
        })
      );
    }

    // Update associated flashcards and questions if category changed
    if (categoryId !== undefined && categoryId !== oldCategoryId) {
      transactionOps.push(
        prisma.customFlashcard.updateMany({
          where: { documentId: id },
          data: { categoryId },
        }),
        prisma.customQuestion.updateMany({
          where: {
            customQuiz: { documentId: id },
          },
          data: { categoryId },
        })
      );
    }

    // Update document and associated data in a transaction
    const [updatedDocument] = await prisma.$transaction(transactionOps);

    console.log("🔄 Invalidating caches after document update...");
    const cacheInvalidations = [
      invalidateCachePattern(`documents:user:${user.id}`),
      invalidateCachePattern(`document:${id}`),
    ];

    // Invalidate old and new category caches if category changed
    if (categoryId !== undefined && categoryId !== oldCategoryId) {
      if (oldCategoryId) {
        cacheInvalidations.push(
          invalidateCachePattern(`documents:category:${user.id}:${oldCategoryId}`)
        );
      }
      cacheInvalidations.push(
        invalidateCachePattern(`documents:category:${user.id}:${categoryId}`)
      );
      cacheInvalidations.push(invalidateCachePattern(`categories:all:${user.id}`));
    }

    await Promise.all(cacheInvalidations);

    // If document was moved out of "Uncategorized", check if we should auto-delete it
    if (categoryId !== undefined && categoryId !== oldCategoryId && oldCategoryId) {
      // Check if the old category was "Uncategorized"
      const oldCategory = await prisma.category.findUnique({
        where: { id: oldCategoryId },
        select: { name: true, userId: true, isDefault: true },
      });

      if (oldCategory && oldCategory.name === "Uncategorized" && oldCategory.userId === user.id && !oldCategory.isDefault) {
        // Import and call cleanup function
        const { cleanupUncategorizedCategory } = await import("./categoryController");
        await cleanupUncategorizedCategory(user.id);
      }
    }

    return c.json({
      success: true,
      data: updatedDocument
    });
  } catch (error) {
    console.error("Update document error:", error);
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

    // Store categoryId before deletion for cleanup check
    const categoryId = document.categoryId;

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

    // If document was in "Uncategorized", check if we should auto-delete it
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true, userId: true, isDefault: true },
      });

      if (category && category.name === "Uncategorized" && category.userId === user.id && !category.isDefault) {
        // Import and call cleanup function
        const { cleanupUncategorizedCategory } = await import("./categoryController");
        await cleanupUncategorizedCategory(user.id);
      }
    }

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

    // Optimized: Only select fields we actually need (avoids fetching 100+ unnecessary language fields)
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        filename: true,
        ocrProcessed: true,
        categoryId: true,
        user: {
          select: {
            id: true,
            defaultPrivacy: true,
          }
        },
        translation: {
          select: { id: true, documentId: true }  // Just for existence check
        },
        flashcards: {
          select: { id: true }  // Just for count
        },
        customQuizzes: {
          select: {
            id: true,
            categoryId: true,
            questions: {
              select: { id: true }  // Just for count
            }
          }
        }
      }
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    // Check if user can access this document
    const hasAccess = await canAccessDocument(user.id, document, id);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Optimized: Batch Redis reads using mGet (faster than sequential gets)
    const quickCacheKey = `flashcards:quick:${id}`;
    const translationQuickCacheKey = `translation:quick:${id}`;

    const [quickCached, translationQuickCached] = await redisClient.mGet([
      quickCacheKey,
      translationQuickCacheKey
    ]);

    const hasQuickCache = !!quickCached;
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
    const hasFlashcardsInDb = flashcardCount > 0; // Only true when DB flashcards exist

    const quiz = document.customQuizzes[0];
    const questionCount = quiz?.questions.length || 0;
    const hasQuizInDb = !!quiz && questionCount > 0;

    // Status tracking optimization: Questions tick off early, flashcards tick off late
    // - hasQuiz ticks off when quick cache exists (user sees questions available faster)
    // - hasFlashcards ticks off only when DB save completes (prevents premature completion)
    const hasQuiz = hasQuizInDb || (hasQuickCache && quickQuestionCount > 0);
    const hasFlashcards = hasFlashcardsInDb;

    let status: "processing" | "completed" | "error" = "processing";

    if (document.ocrProcessed && hasTranslation && hasFlashcardsInDb && hasQuiz) {
      status = "completed";
    } else if (document.ocrProcessed === false) {
      status = "processing";
    }

    const response = {
      status: {
        status,
        hasTranslation,
        hasFlashcards, // Ticks off when DB save completes (slower, more accurate)
        hasQuiz, // Ticks off when quick cache exists (faster, better UX)
        flashcardCount: hasFlashcardsInDb ? flashcardCount : quickFlashcardCount,
        questionCount: hasQuizInDb ? questionCount : quickQuestionCount,
        categoryId: quiz?.categoryId || quickCategoryId || document.categoryId || null,
        quickTranslation: hasQuickCache && !hasFlashcardsInDb,
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

      // Fetch document to get filename and check access
      const document = await prisma.document.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          filename: true,
          user: {
            select: {
              id: true,
              defaultPrivacy: true,
            }
          }
        },
      });

      if (!document) {
        return c.json({ error: "Document not found" }, 404);
      }

      // Check if user can access this document
      const hasAccess = await canAccessDocument(user.id, document, id);
      if (!hasAccess) {
        return c.json({ error: "Forbidden" }, 403);
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
            user: {
              select: {
                id: true,
                defaultPrivacy: true,
              }
            },
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
        include: {
          user: {
            select: {
              id: true,
              defaultPrivacy: true,
            }
          }
        }
      });

      if (!document) {
        return c.json({ error: "Document not found" }, 404);
      }

      // Check if user can access this document
      const hasAccess = await canAccessDocument(user.id, document, id);
      if (!hasAccess) {
        return c.json({ error: "Forbidden" }, 403);
      }

      return c.json({
        translation: null,
        processing: true,
        message: "Translation is being generated. Please wait...",
      });
    }

    // Check if user can access this document
    const hasAccess = await canAccessDocument(user.id, translation.document, id);
    if (!hasAccess) {
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
