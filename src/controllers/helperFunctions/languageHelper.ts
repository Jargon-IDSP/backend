import type { Langs } from "../../interfaces/customFlashcard";
import { prisma } from "../../lib/prisma";
import redisClient from "../../lib/redis";

// Helper function to get from cache
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

// Helper function to set cache
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

export async function getUserLanguage(userId: string): Promise<Langs> {
  try {
    // Check cache first
    const cacheKey = `user:language:${userId}`;
    const cached = await getFromCache<Langs>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database if not cached
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });

    const language = normalizeLanguage(user?.language || "english");

    // Cache for 1 hour (user language doesn't change often)
    await setCache(cacheKey, language, 3600);

    return language;
  } catch (error) {
    console.error("Error fetching user language:", error);
    return "english";
  }
}

export async function getUserLanguageFromContext(c: any): Promise<Langs> {
  const user = c.get("user");
  if (user?.language) {
    return normalizeLanguage(user.language);
  }

  const userId = c.get("userId");
  if (userId) {
    return await getUserLanguage(userId);
  }

  return "english";
}

export function normalizeLanguage(language: string): Langs {
  const normalized = language.toLowerCase();
  const validLanguages: Langs[] = [
    "english",
    "french",
    "chinese",
    "spanish",
    "tagalog",
    "punjabi",
    "korean",
  ];

  if (validLanguages.includes(normalized as Langs)) {
    return normalized as Langs;
  }

  return "english";
}

export function getLanguageFields(language: Langs) {
  const capitalizedLang = language.charAt(0).toUpperCase() + language.slice(1);

  return {
    term: `term${capitalizedLang}` as const,
    definition: `definition${capitalizedLang}` as const,
    prompt: `prompt${capitalizedLang}` as const,
    text: `text${capitalizedLang}` as const,
  };
}

export function transformFlashcard(
  flashcard: any,
  userLanguage: Langs = "english"
) {
  const englishFields = getLanguageFields("english");
  const userFields = getLanguageFields(userLanguage);

  return {
    id: flashcard.id,
    term: {
      english: flashcard.termEnglish || flashcard[englishFields.term] || "",
      [userLanguage]: flashcard[userFields.term] || "",
    },
    definition: {
      english:
        flashcard.definitionEnglish ||
        flashcard[englishFields.definition] ||
        "",
      [userLanguage]: flashcard[userFields.definition] || "",
    },
    ...(flashcard.industryId && { industryId: flashcard.industryId }),
    ...(flashcard.levelId && { levelId: flashcard.levelId }),
    ...(flashcard.documentId && { documentId: flashcard.documentId }),
    ...(flashcard.userId && { userId: flashcard.userId }),
  };
}

export function transformFlashcards(
  flashcards: any[],
  userLanguage: Langs = "english"
) {
  return flashcards.map((fc) => transformFlashcard(fc, userLanguage));
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

export function transformQuestion(
  question: any,
  userLanguage: Langs = "english"
) {
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

export function transformQuestions(
  questions: any[],
  userLanguage: Langs = "english"
) {
  return questions.map((q) => transformQuestion(q, userLanguage));
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

export function getCustomFlashcardSelect(userLanguage: Langs = "english") {
  const userFields = getLanguageFields(userLanguage);

  return {
    id: true,
    termEnglish: true,
    [userFields.term]: true,
    definitionEnglish: true,
    [userFields.definition]: true,
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
    promptFrench: true,
    promptChinese: true,
    promptSpanish: true,
    promptTagalog: true,
    promptPunjabi: true,
    promptKorean: true,
    difficulty: true,
    points: true,
    tags: true,
  };
}

export function getCustomQuestionSelect(userLanguage: Langs = "english") {
  const userFields = getLanguageFields(userLanguage);

  return {
    id: true,
    correctTermId: true,
    promptEnglish: true,
    promptFrench: true,
    promptChinese: true,
    promptSpanish: true,
    promptTagalog: true,
    promptPunjabi: true,
    promptKorean: true,
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

// Utility to invalidate user language cache when user updates their language preference
export async function invalidateUserLanguageCache(
  userId: string
): Promise<void> {
  try {
    const cacheKey = `user:language:${userId}`;
    await redisClient.del(cacheKey);
    console.log(`🗑️  User language cache invalidated for user: ${userId}`);
  } catch (error) {
    console.error(`Error invalidating user language cache:`, error);
  }
}
