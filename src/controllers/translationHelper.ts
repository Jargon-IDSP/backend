import type { QuizCategory } from "../interfaces/quizData";
import type { DocumentTranslationData } from "../interfaces/documentInterfaces";
import { callGenAIForJSON, callGenAI } from "./helperFunctions/aiHelper";

/**
 * Translates full document text into all supported languages
 */
export async function translateFullDocument(
  ocrText: string,
  documentId: string,
  userId: string
): Promise<DocumentTranslationData> {
  const prompt = `
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

  const translations = await callGenAIForJSON<{
    french: string;
    chinese: string;
    spanish: string;
    tagalog: string;
    punjabi: string;
    korean: string;
  }>(prompt);

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

/**
 * Automatically categorize a quiz based on document content
 */
export async function categorizeDocument(
  ocrText: string
): Promise<QuizCategory> {
  const prompt = `
Analyze the following text and categorize it into ONE of these categories:
- SAFETY: Safety procedures, hazard warnings, protective equipment
- TECHNICAL: Technical specifications, engineering, machinery
- TRAINING: Training materials, educational content, learning guides
- WORKPLACE: Workplace policies, HR, general office procedures
- PROFESSIONAL: Professional development, career guidance, business skills
- GENERAL: General information that doesn't fit other categories

Return ONLY the category name, nothing else.

Text:
"""
${ocrText.slice(0, 3000)}
"""
`.trim();

  const responseText = await callGenAI(prompt);
  const normalized = responseText.trim().toUpperCase();

  const validCategories: QuizCategory[] = [
    "Safety",
    "Technical",
    "Training",
    "Workplace",
    "Professional",
    "General",
  ];

  for (const category of validCategories) {
    if (normalized.includes(category.toUpperCase())) {
      return category;
    }
  }

  return "General";
}

/**
 * Get category color for UI
 */
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