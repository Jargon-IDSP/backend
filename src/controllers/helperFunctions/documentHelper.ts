import { GoogleGenAI } from "@google/genai";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../../lib/s3";
import { prisma } from "../../lib/prisma";
import { getGoogleAccessToken, getGoogleCloudConfig } from "../../lib/OCRData";
import crypto from "crypto";
import type { QuizCategory } from "../../interfaces/customFlashcard";
import type { DocumentTranslationData } from "../../interfaces/documentInterfaces";
import { MODEL } from "./aiHelper";
import redisClient, { connectRedis } from "../../lib/redis";

const AllowedOCRFileTypes = ["application/pdf", "image/jpeg", "image/png"];

// Helper function to get or set cache
async function getCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 3600 // Default 1 hour
): Promise<T> {
  try {
    // Ensure Redis is connected
    if (!redisClient.isOpen) {
      await connectRedis();
    }

    // Try to get from cache
    const cached = await redisClient.get(key);
    if (cached) {
      console.log(`✅ Cache hit: ${key}`);
      return JSON.parse(cached) as T;
    }

    console.log(`❌ Cache miss: ${key}`);
    // If not in cache, fetch data
    const data = await fetchFn();

    // Store in cache
    await redisClient.setEx(key, ttl, JSON.stringify(data));

    return data;
  } catch (error) {
    console.error(`Redis error for key ${key}:`, error);
    // Fallback to direct fetch if Redis fails
    return await fetchFn();
  }
}

// Helper function to invalidate cache
async function invalidateCache(pattern: string) {
  try {
    if (!redisClient.isOpen) {
      await connectRedis();
    }
    await redisClient.del(pattern);
    console.log(`🗑️ Cache invalidated: ${pattern}`);
  } catch (error) {
    console.error(`Error invalidating cache for pattern ${pattern}:`, error);
  }
}

function extractResponseText(response: any): string {
  return (
    response.text ??
    response.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || "")
      .join("") ??
    ""
  );
}

function parseGenAIJSON<T>(responseText: string): T {
  try {
    return JSON.parse(responseText);
  } catch {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse AI response as JSON");
    return JSON.parse(match[0]);
  }
}

async function callGenAI(prompt: string): Promise<string> {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Missing GOOGLE_GENAI_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return extractResponseText(response);
}

// Map user language preference to field name
const LANGUAGE_MAP: Record<string, keyof DocumentTranslationData> = {
  english: "textEnglish",
  french: "textFrench",
  chinese: "textChinese",
  spanish: "textSpanish",
  tagalog: "textTagalog",
  punjabi: "textPunjabi",
  korean: "textKorean",
};

async function translateSingleLanguage(
  text: string,
  targetLanguage: string
): Promise<string> {
  if (targetLanguage === "english") {
    return text; // Already in English
  }

  // Create cache key based on text hash and language
  const textHash = crypto
    .createHash("md5")
    .update(text.slice(0, 8000))
    .digest("hex");
  const cacheKey = `translation:single:${targetLanguage}:${textHash}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const translatePrompt = `
Translate the following text into ${targetLanguage}.
Maintain the original formatting and structure as much as possible.
Return ONLY the translated text, no JSON, no extra formatting.

Text to translate:
"""
${text.slice(0, 8000)}
"""
`.trim();

      return await callGenAI(translatePrompt);
    },
    86400 // 24 hours cache (translations are static)
  );
}

export async function translateUserPreferredLanguage(
  text: string,
  userLanguage: string
): Promise<string> {
  return await translateSingleLanguage(text, userLanguage);
}

export async function translateFullDocument(
  ocrText: string,
  documentId: string,
  userId: string
): Promise<DocumentTranslationData> {
  // Cache key based on document ID
  const cacheKey = `translation:full:${documentId}`;

  return await getCachedData(
    cacheKey,
    async () => {
      // Parallelize translations for all 6 languages (instead of 1 sequential call)
      const languages = ['french', 'chinese', 'spanish', 'tagalog', 'punjabi', 'korean'] as const;

      const [french, chinese, spanish, tagalog, punjabi, korean] = await Promise.all(
        languages.map(lang => translateSingleLanguage(ocrText, lang))
      );

      return {
        id: crypto.randomUUID(),
        documentId,
        userId,
        textEnglish: ocrText,
        textFrench: french,
        textChinese: chinese,
        textSpanish: spanish,
        textTagalog: tagalog,
        textPunjabi: punjabi,
        textKorean: korean,
      };
    },
    86400 // 24 hours cache (translations are static)
  );
}

export async function categorizeDocument(ocrText: string): Promise<number> {
  // Create cache key based on text hash
  const textHash = crypto
    .createHash("md5")
    .update(ocrText.slice(0, 3000))
    .digest("hex");
  const cacheKey = `categorization:${textHash}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const categoryPrompt = `
Analyze the following text and categorize it into ONE of these categories:
- Safety: Safety procedures, hazard warnings, protective equipment
- Technical: Technical specifications, engineering, machinery
- Training: Training materials, educational content, learning guides
- Workplace: Workplace policies, HR, general office procedures
- Professional: Professional development, career guidance, business skills
- General: General information that doesn't fit other categories

Return ONLY the category name (with capital first letter), nothing else.

Text:
"""
${ocrText.slice(0, 3000)}
"""
`.trim();

      const responseText = await callGenAI(categoryPrompt);
      const normalized = responseText.trim();

      // Map category name to ID
      const categoryMap: Record<string, number> = {
        Safety: 1,
        Technical: 2,
        Training: 3,
        Workplace: 4,
        Professional: 5,
        General: 6,
      };

      // Try exact match first
      if (categoryMap[normalized]) {
        return categoryMap[normalized];
      }

      // Try case-insensitive match
      for (const [name, id] of Object.entries(categoryMap)) {
        if (normalized.toLowerCase() === name.toLowerCase()) {
          return id;
        }
      }

      // Try partial match
      for (const [name, id] of Object.entries(categoryMap)) {
        if (normalized.toLowerCase().includes(name.toLowerCase())) {
          return id;
        }
      }

      // Default to General
      return 6;
    },
    2592000 // 30 days cache (categorization is very stable)
  );
}

export function createQuizData(
  documentId: string,
  userId: string,
  filename: string,
  categoryId: number = 6 // Default to General
) {
  return {
    id: crypto.randomUUID(),
    userId,
    documentId,
    name: filename,
    categoryId,
    pointsPerQuestion: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function downloadFileFromS3(fileKey: string): Promise<string> {
  // Cache S3 file downloads by fileKey
  const cacheKey = `s3:file:${fileKey}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const getCommand = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: fileKey,
      });

      const s3Response = await s3.send(getCommand);
      const chunks: Uint8Array[] = [];

      for await (const chunk of s3Response.Body as any) {
        chunks.push(chunk);
      }

      const fileBuffer = Buffer.concat(chunks);
      return fileBuffer.toString("base64");
    },
    7200 // 2 hours cache (files don't change often)
  );
}

async function processWithDocumentAI(
  base64Content: string,
  mimeType: string
): Promise<string> {
  // Cache Document AI results by content hash
  const contentHash = crypto
    .createHash("md5")
    .update(base64Content.slice(0, 1000))
    .digest("hex");
  const cacheKey = `ocr:documentai:${contentHash}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const accessToken = await getGoogleAccessToken();
      const config = getGoogleCloudConfig();
      const { projectId, location, processorId } = config;

      if (!projectId || !processorId) {
        throw new Error("Missing GCP_PROJECT_ID or PROCESSOR_ID");
      }

      const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawDocument: {
            content: base64Content,
            mimeType,
          },
          skipHumanReview: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Document AI error: ${error}`);
      }

      const result: any = await response.json();
      return result.document?.text || "";
    },
    86400 // 24 hours cache (OCR results are static for a given document)
  );
}

export async function performOCR(
  documentId: string,
  userId: string
): Promise<string | null> {
  // Cache OCR results by document ID
  const cacheKey = `ocr:document:${documentId}`;

  return await getCachedData(
    cacheKey,
    async () => {
      try {
        const document = await prisma.document.findUnique({
          where: { id: documentId },
        });

        if (!document || document.userId !== userId) {
          console.error(`Document ${documentId} not found or unauthorized`);
          return null;
        }

        if (!AllowedOCRFileTypes.includes(document.fileType)) {
          console.log(`File type ${document.fileType} not supported for OCR`);
          return null;
        }

        const base64Content = await downloadFileFromS3(document.fileKey);
        const extractedText = await processWithDocumentAI(
          base64Content,
          document.fileType
        );

        if (extractedText) {
          await prisma.document.update({
            where: { id: documentId },
            data: {
              extractedText,
              ocrProcessed: true,
            },
          });
        }

        return extractedText;
      } catch (error) {
        console.error(`OCR failed for ${documentId}:`, error);
        return null;
      }
    },
    86400 // 24 hours cache
  );
}

export async function getExistingTerms(userId: string): Promise<string[]> {
  const cacheKey = `terms:existing:${userId}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const [core, custom] = await Promise.all([
        prisma.flashcard.findMany({ select: { termEnglish: true } }),
        prisma.customFlashcard.findMany({
          where: { userId },
          select: { termEnglish: true },
        }),
      ]);

      return [
        ...core.map((t) => t.termEnglish),
        ...custom.map((t) => t.termEnglish),
      ];
    },
    3600 // 1 hour cache
  );
}

export function transformToFlashcardData(
  terms: any[],
  documentId: string,
  userId: string,
  categoryId: number = 6
) {
  return terms.map((t) => ({
    id: crypto.randomUUID(),
    documentId,
    userId,
    categoryId,
    termEnglish: t.term.term.english,
    termFrench: t.term.term.french,
    termChinese: t.term.term.chinese,
    termSpanish: t.term.term.spanish,
    termTagalog: t.term.term.tagalog,
    termPunjabi: t.term.term.punjabi,
    termKorean: t.term.term.korean,
    definitionEnglish: t.term.definition.english,
    definitionFrench: t.term.definition.french,
    definitionChinese: t.term.definition.chinese,
    definitionSpanish: t.term.definition.spanish,
    definitionTagalog: t.term.definition.tagalog,
    definitionPunjabi: t.term.definition.punjabi,
    definitionKorean: t.term.definition.korean,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

export function transformToQuestionData(
  questions: any[],
  indexToIdMap: Map<number, string>,
  quizId: string,
  userId: string,
  categoryId: number = 6
) {
  return questions.map((q, i) => {
    const index = Number(q.correctTermId) || i + 1;
    const correctId = indexToIdMap.get(index)!;

    return {
      id: crypto.randomUUID(),
      userId,
      customQuizId: quizId,
      correctTermId: correctId,
      categoryId,
      promptEnglish: q.prompt.english,
      promptFrench: q.prompt.french,
      promptChinese: q.prompt.chinese,
      promptSpanish: q.prompt.spanish,
      promptTagalog: q.prompt.tagalog,
      promptPunjabi: q.prompt.punjabi,
      promptKorean: q.prompt.korean,
      pointsWorth: 10,
      createdAt: new Date(),
    };
  });
}

export function createIndexToIdMap(flashcards: any[]): Map<number, string> {
  const map = new Map<number, string>();
  flashcards.forEach((cf, i) => map.set(i + 1, cf.id));
  return map;
}

// Cache invalidation helpers
export async function invalidateDocumentCache(documentId: string) {
  await invalidateCache(`ocr:document:${documentId}`);
  await invalidateCache(`translation:full:${documentId}`);
  console.log(`🗑️ Document cache cleared for ${documentId}`);
}

export async function invalidateUserTermsCache(userId: string) {
  await invalidateCache(`terms:existing:${userId}`);
  console.log(`🗑️ Terms cache cleared for user ${userId}`);
}

export async function invalidateS3FileCache(fileKey: string) {
  await invalidateCache(`s3:file:${fileKey}`);
  console.log(`🗑️ S3 file cache cleared for ${fileKey}`);
}
