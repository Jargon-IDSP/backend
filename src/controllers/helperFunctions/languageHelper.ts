import type { Langs } from "../../interfaces/customFlashcard";
import { prisma } from "../../lib/prisma";

// ============================================
// USER LANGUAGE UTILITIES
// ============================================

/**
 * Get user's preferred language from database
 * Falls back to English if user not found or language not set
 */
export async function getUserLanguage(userId: string): Promise<Langs> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true }
    });
    
    return normalizeLanguage(user?.language || "english");
  } catch (error) {
    console.error("Error fetching user language:", error);
    return "english";
  }
}

/**
 * Get user language from Hono context
 * Checks user object first, then falls back to database
 * Use this in controllers: const lang = await getUserLanguageFromContext(c);
 */
export async function getUserLanguageFromContext(c: any): Promise<Langs> {
  // Try to get from user object first (if auth middleware sets it)
  const user = c.get('user');
  if (user?.language) {
    return normalizeLanguage(user.language);
  }
  
  // Fall back to fetching from database
  const userId = c.get('userId');
  if (userId) {
    return await getUserLanguage(userId);
  }
  
  return "english";
}

// ============================================
// LANGUAGE VALIDATION
// ============================================

export function normalizeLanguage(language: string): Langs {
  const normalized = language.toLowerCase();
  const validLanguages: Langs[] = ["english", "french", "chinese", "spanish", "tagalog", "punjabi", "korean"];
  
  if (validLanguages.includes(normalized as Langs)) {
    return normalized as Langs;
  }
  
  return "english"; 
}

// ============================================
// LANGUAGE FIELD UTILITIES
// ============================================

export function getLanguageFields(language: Langs) {
  const capitalizedLang = language.charAt(0).toUpperCase() + language.slice(1);
  
  return {
    term: `term${capitalizedLang}` as const,
    definition: `definition${capitalizedLang}` as const,
    prompt: `prompt${capitalizedLang}` as const,
    text: `text${capitalizedLang}` as const,
  };
}

// ============================================
// FLASHCARD TRANSFORMATION
// ============================================

export function transformFlashcard(flashcard: any, userLanguage: Langs = "english") {
  const englishFields = getLanguageFields("english");
  const userFields = getLanguageFields(userLanguage);
  
  return {
    id: flashcard.id,
    term: {
      english: flashcard.termEnglish || flashcard[englishFields.term] || "",
      [userLanguage]: flashcard[userFields.term] || "",
    },
    definition: {
      english: flashcard.definitionEnglish || flashcard[englishFields.definition] || "",
      [userLanguage]: flashcard[userFields.definition] || "",
    },
    ...(flashcard.industryId && { industryId: flashcard.industryId }),
    ...(flashcard.levelId && { levelId: flashcard.levelId }),
    ...(flashcard.documentId && { documentId: flashcard.documentId }),
    ...(flashcard.userId && { userId: flashcard.userId }),
  };
}

export function transformFlashcards(flashcards: any[], userLanguage: Langs = "english") {
  return flashcards.map(fc => transformFlashcard(fc, userLanguage));
}

export function transformFlashcardAllLanguages(flashcard: any) {
  return {
    id: flashcard.id,
    term: {
      english: flashcard.termEnglish || "",
      french: flashcard.termFrench || "",
      chinese: flashcard.termChinese || "",
      spanish: flashcard.termSpanish || "",
      tagalog: flashcard.termTagalog || "",
      punjabi: flashcard.termPunjabi || "",
      korean: flashcard.termKorean || "",
    },
    definition: {
      english: flashcard.definitionEnglish || "",
      french: flashcard.definitionFrench || "",
      chinese: flashcard.definitionChinese || "",
      spanish: flashcard.definitionSpanish || "",
      tagalog: flashcard.definitionTagalog || "",
      punjabi: flashcard.definitionPunjabi || "",
      korean: flashcard.definitionKorean || "",
    },
    ...(flashcard.industryId && { industryId: flashcard.industryId }),
    ...(flashcard.levelId && { levelId: flashcard.levelId }),
    ...(flashcard.documentId && { documentId: flashcard.documentId }),
    ...(flashcard.userId && { userId: flashcard.userId }),
  };
}

// ============================================
// QUESTION TRANSFORMATION
// ============================================

export function transformQuestion(question: any, userLanguage: Langs = "english") {
  const userFields = getLanguageFields(userLanguage);
  
  return {
    id: question.id,
    correctTermId: question.correctTermId,
    prompt: {
      english: question.promptEnglish || "",
      [userLanguage]: question[userFields.prompt] || "",
    },
    ...(question.difficulty && { difficulty: question.difficulty }),
    ...(question.points && { points: question.points }),
    ...(question.pointsWorth && { pointsWorth: question.pointsWorth }),
    ...(question.customQuizId && { customQuizId: question.customQuizId }),
  };
}

export function transformQuestions(questions: any[], userLanguage: Langs = "english") {
  return questions.map(q => transformQuestion(q, userLanguage));
}

export function transformQuestionAllLanguages(question: any) {
  return {
    id: question.id,
    correctTermId: question.correctTermId,
    prompt: {
      english: question.promptEnglish || "",
      french: question.promptFrench || "",
      chinese: question.promptChinese || "",
      spanish: question.promptSpanish || "",
      tagalog: question.promptTagalog || "",
      punjabi: question.promptPunjabi || "",
      korean: question.promptKorean || "",
    },
    ...(question.difficulty && { difficulty: question.difficulty }),
    ...(question.points && { points: question.points }),
    ...(question.pointsWorth && { pointsWorth: question.pointsWorth }),
    ...(question.customQuizId && { customQuizId: question.customQuizId }),
  };
}

// ============================================
// PRISMA SELECT OBJECTS
// ============================================

export function getFlashcardSelect(userLanguage: Langs = "english") {
  const userFields = getLanguageFields(userLanguage);
  
  return {
    id: true,
    termEnglish: true,
    [userFields.term]: true,
    definitionEnglish: true,
    [userFields.definition]: true,
    industryId: true,
    levelId: true,
    documentId: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  };
}

export function getQuestionSelect(userLanguage: Langs = "english") {
  const userFields = getLanguageFields(userLanguage);
  
  return {
    id: true,
    correctTermId: true,
    promptEnglish: true,
    [userFields.prompt]: true,
    difficulty: true,
    points: true,
    pointsWorth: true,
    customQuizId: true,
  };
}

export function getAllLanguageFields() {
  return {
    termEnglish: true,
    termFrench: true,
    termChinese: true,
    termSpanish: true,
    termTagalog: true,
    termPunjabi: true,
    termKorean: true,
    definitionEnglish: true,
    definitionFrench: true,
    definitionChinese: true,
    definitionSpanish: true,
    definitionTagalog: true,
    definitionPunjabi: true,
    definitionKorean: true,
  };
}

export function getAllQuestionLanguageFields() {
  return {
    promptEnglish: true,
    promptFrench: true,
    promptChinese: true,
    promptSpanish: true,
    promptTagalog: true,
    promptPunjabi: true,
    promptKorean: true,
  };
}