import { GoogleGenAI } from "@google/genai";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../../lib/s3";
import { prisma } from "../../lib/prisma";
import { getGoogleAccessToken, getGoogleCloudConfig } from "../../lib/OCRData";
import crypto from "crypto";
import type { QuizCategory } from "../../interfaces/customFlashcard";
import type { DocumentTranslationData } from "../../interfaces/documentInterfaces";

const MODEL = "gemini-flash-latest";
const AllowedOCRFileTypes = ['application/pdf', 'image/jpeg', 'image/png'];

function extractResponseText(response: any): string {
  return (
    response.text ??
    response.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ??
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


export async function translateFullDocument(
  ocrText: string,
  documentId: string,
  userId: string
): Promise<DocumentTranslationData> {
  const translatePrompt = `
Translate the following text into french, chinese, spanish, tagalog, punjabi, and korean.
Maintain the original formatting and structure as much as possible.

Return STRICT JSON ONLY in this format:
{
  "french": "...",
  "chinese": "...",
  "spanish": "...",
  "tagalog": "...",
  "punjabi": "...",
  "korean": "..."
}

Text to translate:
"""
${ocrText.slice(0, 8000)}
"""
`.trim();

  const responseText = await callGenAI(translatePrompt);
  const translations = parseGenAIJSON<{
    french: string;
    chinese: string;
    spanish: string;
    tagalog: string;
    punjabi: string;
    korean: string;
  }>(responseText);

  return {
    id: crypto.randomUUID(),
    documentId,
    userId,
    textEnglish: ocrText,
    textFrench: translations.french,
    textChinese: translations.chinese,
    textSpanish: translations.spanish,
    textTagalog: translations.tagalog,
    textPunjabi: translations.punjabi,
    textKorean: translations.korean,
  };
}



export async function categorizeDocument(ocrText: string): Promise<QuizCategory> {
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

  const validCategories: QuizCategory[] = [
    "Safety",
    "Technical",
    "Training",
    "Workplace",
    "Professional",
    "General",
  ];

  // Try exact match first
  for (const category of validCategories) {
    if (normalized === category) {
      return category as QuizCategory;
    }
  }

  // Try case-insensitive match
  for (const category of validCategories) {
    if (normalized.toLowerCase() === category.toLowerCase()) {
      return category as QuizCategory;
    }
  }

  // Try partial match
  for (const category of validCategories) {
    if (normalized.toLowerCase().includes(category.toLowerCase())) {
      return category as QuizCategory;
    }
  }

  return "General";
}


export function getCategoryColor(category: QuizCategory | null): string {
  if (!category) return "#6B7280";
  
  const colors: Record<QuizCategory, string> = {
    Safety: "#EF4444",       
    Technical: "#3B82F6",    
    Training: "#8B5CF6",     
    Workplace: "#10B981",   
    Professional: "#F59E0B", 
    General: "#6B7280",     
  };
  
  return colors[category] || "#6B7280";
}

async function downloadFileFromS3(fileKey: string): Promise<string> {
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
}

async function processWithDocumentAI(
  base64Content: string,
  mimeType: string
): Promise<string> {
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
}

export async function performOCR(
  documentId: string,
  userId: string
): Promise<string | null> {
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
    const extractedText = await processWithDocumentAI(base64Content, document.fileType);

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
}

export async function getExistingTerms(userId: string): Promise<string[]> {
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
}


export function createQuizData(
  documentId: string,
  userId: string,
  filename: string,
  category: QuizCategory = "General"
) {
  return {
    id: crypto.randomUUID(),
    userId,
    documentId,
    name: filename,
    category,
    pointsPerQuestion: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}


export function transformToFlashcardData(
  terms: any[],
  documentId: string,
  userId: string
) {
  return terms.map((t) => ({
    id: crypto.randomUUID(),
    documentId,
    userId,
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
  userId: string
) {
  return questions.map((q, i) => {
    const index = Number(q.correctTermId) || i + 1;
    const correctId = indexToIdMap.get(index)!;

    return {
      id: crypto.randomUUID(),
      userId,
      customQuizId: quizId,
      correctTermId: correctId,
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