import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../lib/prisma";
import type {
  Langs,
  QuizCategory,
  TermOut,
  QuestionOut,
  GenerateResult,
  GenerateCustomFromOCROptions,
  ExtractionResponse,
  TranslationResponse,
  CustomFlashcardData,
  CustomQuestionData,
} from "../../interfaces/customFlashcard";
import type { CustomQuizData } from "../../interfaces/quizData";
import {
  MODEL,
  extractResponseText,
  parseJSONResponse,
} from "./aiHelper";
import {
  normalizeLanguage,
  getLanguageFieldName,
  getAllLanguageFields,
  getLanguageSelect,
  convertToDisplayFormat,
} from "./translationHelper";

export { normalizeLanguage, getLanguageFieldName, getAllLanguageFields };

export function getCustomFlashcardSelect(userLanguage: Langs = "english") {
  return getLanguageSelect(userLanguage, {
    id: true,
    documentId: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  });
}

export const convertCustomToDisplayFormat = (dbFlashcard: any, language?: string) => {
  return convertToDisplayFormat(
    dbFlashcard,
    { language },
    {
      documentId: dbFlashcard.documentId,
      userId: dbFlashcard.userId,
    }
  );
};


export const convertCustomToDisplayFormatAllLanguages = (dbFlashcard: any) => {
  return convertToDisplayFormat(
    dbFlashcard,
    { includeAllLanguages: true },
    {
      documentId: dbFlashcard.documentId,
      userId: dbFlashcard.userId,
    }
  );
};


export const enrichCustomFlashcard = (flashcard: any, language?: string) => {
  const lang = language?.toLowerCase() || 'english';
  
  return {
    ...convertCustomToDisplayFormat(flashcard, lang),
    document: flashcard.document
      ? {
          id: flashcard.document.id,
          filename: flashcard.document.filename,
          fileUrl: flashcard.document.fileUrl,
        }
      : null,
  };
};

export async function getCustomFlashcardAllLanguages(id: string) {
  const flashcard = await prisma.customFlashcard.findUnique({
    where: { id },
    select: {
      id: true,
      ...getAllLanguageFields(),
      documentId: true,
      userId: true,
      document: {
        select: {
          id: true,
          filename: true,
          fileUrl: true,
        }
      }
    },
  });

  if (!flashcard) return null;
  
  return {
    ...convertCustomToDisplayFormatAllLanguages(flashcard),
    document: flashcard.document,
  };
}


export function formatCustomId(prefix: "C" | "cq", n: number): string {
  return `${prefix}-${n}`;
}

export function makeDedupSet(words: string[]): Set<string> {
  const s = new Set<string>();
  for (const w of words) s.add(w.trim().toLowerCase());
  return s;
}


export async function extractTermsAndQuestions(
  ai: GoogleGenAI,
  ocrText: string,
  existingDbTermsEnglish: string[]
): Promise<ExtractionResponse> {
  const extractionPrompt = `
From the OCR text, you MUST select EXACTLY 15 DISTINCT, meaningful terms.

CRITICAL: Avoid these terms that the user already knows: ${existingDbTermsEnglish.slice(0, 200).join(", ")}

IMPORTANT: You must return exactly 15 terms and 15 questions.
- First, extract terms that appear directly in the document
- If fewer than 15 terms are found, generate additional relevant terms related to the document's topic to reach exactly 15 terms
- For example, if a document mentions "PPE" and "hard hat", you could add related terms like "safety goggles", "steel-toed boots", "high-visibility vest", etc.
- DO NOT include any terms from the "user already knows" list above

For each term provide:
1. A concise English definition (10–25 words)
2. A category classification from: Safety, Technical, Training, Workplace, Professional, or General
   - Safety: Personal protective equipment, safety procedures, hazards, emergency protocols
   - Technical: Tools, equipment, machinery, technical processes, specifications
   - Training: Learning methods, skill development, certifications, apprenticeship
   - Workplace: Work environment, team collaboration, workplace policies, communication
   - Professional: Career development, industry standards, professional conduct, ethics
   - General: Basic concepts that don't fit other categories

Also produce EXACTLY 15 question prompts (one per term) where the correct answer is exactly one of your selected terms. Do NOT include the exact term in the prompt text.

Return STRICT JSON ONLY:
{
  "terms": [
    { "english": "Term1", "definitionEnglish": "...", "category": "Safety" },
    ...
  ],
  "questions": [
    { "promptEnglish": "Which term refers to ... ?", "correctEnglish": "Term1" },
    ...
  ]
}

OCR:
"""${ocrText.slice(0, 6000)}"""
`.trim();

  const extractionResp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: extractionPrompt }] }],
  });

  const extractionText = extractResponseText(extractionResp);
  return parseJSONResponse<ExtractionResponse>(extractionText);
}

// Quick translation: English + user's preferred language only (FAST!)
export async function translateUserPreferredLanguageOnly(
  ai: GoogleGenAI,
  terms: { english: string; definitionEnglish: string }[],
  questions: { promptEnglish: string; correctEnglish: string }[],
  targetLanguage: string
): Promise<TranslationResponse> {
  // If English, no translation needed - just return empty translations
  if (targetLanguage.toLowerCase() === 'english') {
    return {
      terms: terms.map(t => ({
        english: t.english,
        term: { french: '', chinese: '', spanish: '', tagalog: '', punjabi: '', korean: '' },
        definition: { french: '', chinese: '', spanish: '', tagalog: '', punjabi: '', korean: '' }
      })),
      questions: questions.map(() => ({
        prompt: { french: '', chinese: '', spanish: '', tagalog: '', punjabi: '', korean: '' }
      }))
    };
  }

  const translatePrompt = `
Translate the following English terms+definitions+prompts into ${targetLanguage} ONLY.
Return STRICT JSON ONLY with this structure (only populate the ${targetLanguage} field):
{
  "terms": [{
    "english": "Adhesive",
    "term": { "${targetLanguage}":"..." },
    "definition": { "${targetLanguage}":"..." }
  }],
  "questions": [{
    "prompt": { "${targetLanguage}":"..." }
  }]
}

SOURCE:
{
  "terms": ${JSON.stringify(terms, null, 2)},
  "questions": ${JSON.stringify(questions, null, 2)}
}
`.trim();

  const translateResp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: translatePrompt }] }],
  });

  const translateText = extractResponseText(translateResp);
  return parseJSONResponse<TranslationResponse>(translateText);
}

// Full translation: All 6 languages (SLOW!) - saves to DB
export async function translateTermsAndQuestions(
  ai: GoogleGenAI,
  terms: { english: string; definitionEnglish: string }[],
  questions: { promptEnglish: string; correctEnglish: string }[]
): Promise<TranslationResponse> {
  const translatePrompt = `
Translate the following English terms+definitions+prompts into french, chinese, spanish, tagalog, punjabi, korean.
Return STRICT JSON ONLY:
{
  "terms": [{
    "english": "Adhesive",
    "term": { "french":"...", "chinese":"...", "spanish":"...", "tagalog":"...", "punjabi":"...", "korean":"..." },
    "definition": { "french":"...", "chinese":"...", "spanish":"...", "tagalog":"...", "punjabi":"...", "korean":"..." }
  }],
  "questions": [{
    "prompt": { "french":"...", "chinese":"...", "spanish":"...", "tagalog":"...", "punjabi":"...", "korean":"..." }
  }]
}

SOURCE:
{
  "terms": ${JSON.stringify(terms, null, 2)},
  "questions": ${JSON.stringify(questions, null, 2)}
}
`.trim();

  const translateResp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: translatePrompt }] }],
  });

  const translateText = extractResponseText(translateResp);
  return parseJSONResponse<TranslationResponse>(translateText);
}

export function cleanAndDeduplicateTerms(
  extractedTerms: { english: string; definitionEnglish: string; category: QuizCategory }[],
  dedupSet: Set<string>,
  limit: number = 10
): { english: string; definitionEnglish: string; category: QuizCategory }[] {
  const cleanTerms = (extractedTerms || [])
    .map((t) => ({
      english: (t.english || "").trim(),
      definitionEnglish: (t.definitionEnglish || "").trim(),
      category: t.category || "General" as QuizCategory,
    }))
    .filter((t) => t.english && !dedupSet.has(t.english.toLowerCase()));

  return cleanTerms.slice(0, limit);
}

export function filterAndFillQuestions(
  questions: { promptEnglish: string; correctEnglish: string }[],
  terms: { english: string; definitionEnglish: string; category: QuizCategory }[]
): { promptEnglish: string; correctEnglish: string; category: QuizCategory }[] {
  const kept = new Set(terms.map((t) => t.english.toLowerCase()));
  let qEnglish = (questions || [])
    .filter((q) => kept.has((q.correctEnglish || "").trim().toLowerCase()))
    .map((q) => {
      const term = terms.find(t => t.english.toLowerCase() === q.correctEnglish.trim().toLowerCase());
      return {
        ...q,
        category: term?.category || "General" as QuizCategory
      };
    })
    .slice(0, 10);

  if (qEnglish.length < terms.length) {
    const need = terms.length - qEnglish.length;
    const fillers = terms.slice(-need).map((t) => ({
      promptEnglish: `Which term matches this definition: ${t.definitionEnglish}?`,
      correctEnglish: t.english,
      category: t.category,
    }));
    qEnglish = qEnglish.concat(fillers).slice(0, 10);
  }

  return qEnglish;
}

export function buildTermsOutput(
  terms: { english: string; definitionEnglish: string; category: QuizCategory }[],
  translated: TranslationResponse,
  documentId: string,
  userId: string
): TermOut[] {
  return terms.map((t, i) => {
    const tr = translated.terms?.find(
      (x: TranslationResponse['terms'][number]) => 
        (x.english || "").trim().toLowerCase() === t.english.toLowerCase()
    );
    const id = formatCustomId("C", i + 1);

    const termMap: Record<Langs, string> = {
      english: t.english,
      french: tr?.term?.french ?? t.english,
      chinese: tr?.term?.chinese ?? t.english,
      spanish: tr?.term?.spanish ?? t.english,
      tagalog: tr?.term?.tagalog ?? t.english,
      punjabi: tr?.term?.punjabi ?? t.english,
      korean: tr?.term?.korean ?? t.english,
    };

    const defMap: Record<Langs, string> = {
      english: t.definitionEnglish,
      french: tr?.definition?.french ?? t.definitionEnglish,
      chinese: tr?.definition?.chinese ?? t.definitionEnglish,
      spanish: tr?.definition?.spanish ?? t.definitionEnglish,
      tagalog: tr?.definition?.tagalog ?? t.definitionEnglish,
      punjabi: tr?.definition?.punjabi ?? t.definitionEnglish,
      korean: tr?.definition?.korean ?? t.definitionEnglish,
    };

    return {
      id,
      term: {
        term: termMap,
        definition: defMap,
        documentId,
        userId,
        category: t.category,
      },
    };
  });
}

export function buildQuestionsOutput(
  questions: { promptEnglish: string; correctEnglish: string; category: QuizCategory }[],
  translated: TranslationResponse,
  documentId: string,
  userId: string,
  terms?: { english: string; definitionEnglish: string; category: QuizCategory }[]
): QuestionOut[] {
  // Create a map of term -> index for quick lookup
  const termIndexMap = new Map<string, number>();
  if (terms) {
    terms.forEach((term, index) => {
      termIndexMap.set(term.english.toLowerCase(), index + 1);
    });
  }

  return questions.map((q, i) => {
    const id = formatCustomId("cq", i + 1);
    const trQ = translated.questions?.[i];

    const prompt: Record<Langs, string> = {
      english: q.promptEnglish,
      french: trQ?.prompt?.french ?? q.promptEnglish,
      chinese: trQ?.prompt?.chinese ?? q.promptEnglish,
      spanish: trQ?.prompt?.spanish ?? q.promptEnglish,
      tagalog: trQ?.prompt?.tagalog ?? q.promptEnglish,
      punjabi: trQ?.prompt?.punjabi ?? q.promptEnglish,
      korean: trQ?.prompt?.korean ?? q.promptEnglish,
    };

    // Find the correct term index in the final terms array
    const correctTermId = termIndexMap.get(q.correctEnglish.toLowerCase()) || String(i + 1);

    return { id, correctTermId: String(correctTermId), prompt, documentId, userId, category: q.category };
  });
}

export function createCustomQuizData(
  documentId: string,
  userId: string,
  name: string, 
  category?: QuizCategory | null
): CustomQuizData {
  return {
    id: crypto.randomUUID(),
    documentId,
    userId,
    name,
    category: category || null,
    pointsPerQuestion: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function transformToCustomFlashcardData(
  terms: TermOut[],
  documentId: string,
  userId: string
): CustomFlashcardData[] {
  return terms.map((t) => {
    const id = crypto.randomUUID();
    return {
      id,
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

      category: t.term.category,
    };
  });
}

export function transformToCustomQuestionData(
  questions: QuestionOut[],
  indexToIdMap: Map<number, string>,
  quizId: string,
  userId: string,
  pointsWorth: number = 10 
): CustomQuestionData[] {
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
      
      pointsWorth,
      category: q.category,
    };
  });
}

export function createIndexToIdMap(
  flashcards: CustomFlashcardData[]
): Map<number, string> {
  const indexToId = new Map<number, string>();
  flashcards.forEach((cf, i) => indexToId.set(i + 1, cf.id));
  return indexToId;
}

export async function generateCustomFromOCR(
  opts: GenerateCustomFromOCROptions
): Promise<GenerateResult> {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Missing GOOGLE_GENAI_API_KEY");
  }

  const { ocrText, userId, documentId, existingDbTermsEnglish } = opts;
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY! });

  const dedup = makeDedupSet(existingDbTermsEnglish || []);

  const extraction = await extractTermsAndQuestions(
    ai,
    ocrText,
    existingDbTermsEnglish
  );

  const top10 = cleanAndDeduplicateTerms(extraction.terms, dedup, 10);

  if (top10.length === 0) {
    throw new Error("No usable terms after deduplication.");
  }

  const qEnglish = filterAndFillQuestions(extraction.questions, top10);

  const translated = await translateTermsAndQuestions(ai, top10, qEnglish);

  const termsOut = buildTermsOutput(top10, translated, documentId, userId);
  const questionsOut = buildQuestionsOutput(qEnglish, translated, documentId, userId);

  return { terms: termsOut, questions: questionsOut };
}