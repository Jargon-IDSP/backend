import { prisma } from "../lib/prisma";
import type { QuizCategory } from "../interfaces/customFlashcard";
import redisClient, { connectRedis } from "../lib/redis";

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
      return JSON.parse(cached) as T;
    }

    // If not in cache, fetch from database
    const data = await fetchFn();

    // Store in cache
    await redisClient.setEx(key, ttl, JSON.stringify(data));

    return data;
  } catch (error) {
    console.error(`Redis error for key ${key}:`, error);
    // Fallback to direct database query if Redis fails
    return await fetchFn();
  }
}

// Helper function to invalidate cache patterns
async function invalidateCache(pattern: string) {
  try {
    if (!redisClient.isOpen) {
      await connectRedis();
    }
    await redisClient.del(pattern);
  } catch (error) {
    console.error(`Error invalidating cache for pattern ${pattern}:`, error);
  }
}

export async function getFlashcardsByQuiz(
  quizId: string,
  language:
    | "english"
    | "french"
    | "chinese"
    | "spanish"
    | "tagalog"
    | "punjabi"
    | "korean" = "english"
) {
  const cacheKey = `flashcards:quiz:${quizId}:${language}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const questions = await prisma.customQuestion.findMany({
        where: { customQuizId: quizId },
        include: {
          correctAnswer: true,
        },
        orderBy: { createdAt: "asc" },
      });

      return questions.map((q) => ({
        id: q.id,
        prompt:
          q[
            `prompt${
              language.charAt(0).toUpperCase() + language.slice(1)
            }` as keyof typeof q
          ],
        term: q.correctAnswer[
          `term${
            language.charAt(0).toUpperCase() + language.slice(1)
          }` as keyof typeof q.correctAnswer
        ],
        definition:
          q.correctAnswer[
            `definition${
              language.charAt(0).toUpperCase() + language.slice(1)
            }` as keyof typeof q.correctAnswer
          ],
      }));
    },
    3600 // 1 hour cache
  );
}

export async function getUserCustomFlashcards(
  userId: string,
  limit: number = 50,
  offset: number = 0
) {
  const cacheKey = `flashcards:user:${userId}:limit:${limit}:offset:${offset}`;

  return await getCachedData(
    cacheKey,
    async () => {
      return await prisma.customFlashcard.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          document: {
            select: { filename: true },
          },
        },
      });
    },
    1800 // 30 minutes cache (frequently changing data)
  );
}

export async function getDocumentFlashcards(documentId: string) {
  const cacheKey = `flashcards:document:${documentId}`;

  return await getCachedData(
    cacheKey,
    async () => {
      return await prisma.customFlashcard.findMany({
        where: { documentId },
        orderBy: { createdAt: "asc" },
      });
    },
    3600 // 1 hour cache
  );
}

export async function getQuizzesByCategory(
  userId: string,
  category: QuizCategory
) {
  const cacheKey = `quizzes:user:${userId}:category:${category}`;

  return await getCachedData(
    cacheKey,
    async () => {
      // Map category name to categoryId
      const categoryMap: Record<QuizCategory, number> = {
        Safety: 1,
        Technical: 2,
        Training: 3,
        Workplace: 4,
        Professional: 5,
        General: 6,
      };

      const categoryId = categoryMap[category];

      return await prisma.customQuiz.findMany({
        where: {
          userId,
          categoryId,
        },
        orderBy: { createdAt: "desc" },
        include: {
          document: {
            select: { filename: true },
          },
          _count: {
            select: { questions: true },
          },
        },
      });
    },
    1800 // 30 minutes cache
  );
}

export async function getUserQuizCategories(userId: string) {
  const cacheKey = `quizzes:user:${userId}:categories`;

  return await getCachedData(
    cacheKey,
    async () => {
      const quizzes = await prisma.customQuiz.groupBy({
        by: ["categoryId"],
        where: {
          userId,
        },
        _count: true,
      });

      // Map categoryId back to category name
      const categoryIdToName: Record<number, QuizCategory> = {
        1: "Safety",
        2: "Technical",
        3: "Training",
        4: "Workplace",
        5: "Professional",
        6: "General",
      };

      return quizzes.map((q) => ({
        category: categoryIdToName[q.categoryId] || "General",
        count: q._count,
      }));
    },
    3600 // 1 hour cache
  );
}

export async function getFlashcardsByLevelAndIndustry(
  levelId: number,
  industryId?: number,
  language:
    | "english"
    | "french"
    | "chinese"
    | "spanish"
    | "tagalog"
    | "punjabi"
    | "korean" = "english"
) {
  const cacheKey = `flashcards:level:${levelId}:industry:${
    industryId || "all"
  }:${language}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const flashcards = await prisma.flashcard.findMany({
        where: {
          levelId,
          ...(industryId ? { industryId } : {}),
        },
        include: {
          level: true,
          industry: true,
        },
      });

      return flashcards.map((f) => ({
        id: f.id,
        term: f[
          `term${
            language.charAt(0).toUpperCase() + language.slice(1)
          }` as keyof typeof f
        ],
        definition:
          f[
            `definition${
              language.charAt(0).toUpperCase() + language.slice(1)
            }` as keyof typeof f
          ],
        level: f.level.name,
        industry: f.industry?.name,
      }));
    },
    7200 // 2 hours cache (static content)
  );
}

export async function getQuestionsByLevel(levelId: number) {
  const cacheKey = `questions:level:${levelId}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const flashcardsAtLevel = await prisma.flashcard.findMany({
        where: { levelId },
        select: { id: true },
      });

      const flashcardIds = flashcardsAtLevel.map((f) => f.id);

      return await prisma.question.findMany({
        where: {
          correctTermId: { in: flashcardIds },
        },
        include: {
          correctAnswer: {
            include: {
              level: true,
              industry: true,
            },
          },
        },
      });
    },
    7200 // 2 hours cache (static content)
  );
}

export async function getQuestionsByDifficulty(
  difficulty: number,
  limit: number = 20
) {
  const cacheKey = `questions:difficulty:${difficulty}:limit:${limit}`;

  return await getCachedData(
    cacheKey,
    async () => {
      return await prisma.question.findMany({
        where: { difficulty },
        take: limit,
        include: {
          correctAnswer: true,
        },
      });
    },
    7200 // 2 hours cache (static content)
  );
}

export async function getFlashcardsByIndustry(
  industryId: number,
  sortByLevel: boolean = true
) {
  const cacheKey = `flashcards:industry:${industryId}:sort:${sortByLevel}`;

  return await getCachedData(
    cacheKey,
    async () => {
      return await prisma.flashcard.findMany({
        where: { industryId },
        orderBy: sortByLevel ? { levelId: "asc" } : { termEnglish: "asc" },
        include: {
          level: true,
          industry: true,
        },
      });
    },
    7200 // 2 hours cache (static content)
  );
}

export async function getDocumentTranslation(documentId: string) {
  const cacheKey = `document:translation:${documentId}`;

  return await getCachedData(
    cacheKey,
    async () => {
      return await prisma.documentTranslation.findUnique({
        where: { documentId },
      });
    },
    3600 // 1 hour cache
  );
}

export async function getDocumentInLanguage(
  documentId: string,
  language:
    | "english"
    | "french"
    | "chinese"
    | "spanish"
    | "tagalog"
    | "punjabi"
    | "korean" = "english"
) {
  const cacheKey = `document:${documentId}:language:${language}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          translation: true,
        },
      });

      if (!doc) return null;

      const textField = `text${
        language.charAt(0).toUpperCase() + language.slice(1)
      }` as keyof typeof doc.translation;

      return {
        ...doc,
        translatedText: doc.translation?.[textField] || doc.extractedText,
      };
    },
    3600 // 1 hour cache
  );
}

export async function searchCustomFlashcards(params: {
  userId: string;
  category?: QuizCategory;
  documentId?: string;
  searchTerm?: string;
  language?: string;
  sortBy?: "date" | "term";
  limit?: number;
  offset?: number;
}) {
  const {
    userId,
    category,
    documentId,
    searchTerm,
    sortBy = "date",
    limit = 50,
    offset = 0,
  } = params;

  // Create cache key from all parameters
  const cacheKey = `flashcards:search:${userId}:${category || "all"}:${
    documentId || "all"
  }:${searchTerm || "all"}:${sortBy}:${limit}:${offset}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const where: any = { userId };

      if (documentId) {
        where.documentId = documentId;
      }

      if (searchTerm) {
        where.termEnglish = {
          contains: searchTerm,
        };
      }

      if (category) {
        // Map category name to categoryId
        const categoryMap: Record<QuizCategory, number> = {
          Safety: 1,
          Technical: 2,
          Training: 3,
          Workplace: 4,
          Professional: 5,
          General: 6,
        };

        const categoryId = categoryMap[category];

        where.questions = {
          some: {
            customQuiz: {
              categoryId,
            },
          },
        };
      }

      const orderBy =
        sortBy === "date"
          ? { createdAt: "desc" as const }
          : { termEnglish: "asc" as const };

      return await prisma.customFlashcard.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          document: {
            select: { filename: true },
          },
        },
      });
    },
    900 // 15 minutes cache (search results change frequently)
  );
}

export async function getUserQuizStats(userId: string) {
  const cacheKey = `quiz:stats:${userId}`;

  return await getCachedData(
    cacheKey,
    async () => {
      const stats = await prisma.userQuizAttempt.groupBy({
        by: ["customQuizId"],
        where: {
          userId,
          customQuizId: { not: null },
          completed: true,
        },
        _count: true,
        _avg: {
          pointsEarned: true,
          percentCorrect: true,
        },
        _sum: {
          pointsEarned: true,
        },
      });

      return stats;
    },
    1800 // 30 minutes cache (stats change with quiz attempts)
  );
}

// Cache invalidation helpers for when data is updated
export async function invalidateUserFlashcardsCache(userId: string) {
  await invalidateCache(`flashcards:user:${userId}:*`);
  await invalidateCache(`flashcards:search:${userId}:*`);
}

export async function invalidateQuizCache(quizId: string) {
  await invalidateCache(`flashcards:quiz:${quizId}:*`);
}

export async function invalidateDocumentCache(documentId: string) {
  await invalidateCache(`flashcards:document:${documentId}`);
  await invalidateCache(`document:${documentId}:*`);
  await invalidateCache(`document:translation:${documentId}`);
}

export async function invalidateUserQuizCache(userId: string) {
  await invalidateCache(`quizzes:user:${userId}:*`);
  await invalidateCache(`quiz:stats:${userId}`);
}
