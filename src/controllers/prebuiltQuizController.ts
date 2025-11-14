import type { Context } from "hono";
import {
  startPrebuiltQuizAttempt,
  recordPrebuiltQuizAnswer,
  getUserApprenticeshipProgress,
  getUserBadges,
  generatePrebuiltQuizQuestions,
} from "./helperFunctions/prebuiltQuizHelper";
import { getUserLanguageFromContext } from "./helperFunctions/languageHelper";
import { prisma } from "../lib/prisma";
import redisClient from "../lib/redis";

// Helper function to get from cache
const getFromCache = async <T>(key: string): Promise<T | null> => {
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      console.log(`✅ Cache HIT: ${key}`);
      return JSON.parse(cached) as T;
    }
    console.log(`❌ Cache MISS: ${key}`);
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
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error(`Error setting cache for ${key}:`, error);
  }
};

// Helper function to invalidate cache by pattern
const invalidateCachePattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(
        `🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`
      );
    }
  } catch (error) {
    console.error(`Error invalidating cache pattern ${pattern}:`, error);
  }
};

/**
 * GET /api/prebuilt-quizzes/levels/:levelId/industry/:industryId?
 * Get all prebuilt quizzes for a level and industry
 */
export async function getPrebuiltQuizzesForLevel(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const levelId = parseInt(c.req.param("levelId"));
    const industryIdParam = c.req.param("industryId");
    const industryId = industryIdParam ? parseInt(industryIdParam) : null;

    if (isNaN(levelId)) {
      return c.json({ error: "Invalid levelId" }, 400);
    }

    // Cache key for static quiz data
    const cacheKey = `prebuilt-quizzes:level:${levelId}:industry:${industryId || 'general'}`;
    const cached = await getFromCache<any[]>(cacheKey);

    if (cached) {
      return c.json({ quizzes: cached }, 200);
    }

    const quizzes = await prisma.prebuiltQuiz.findMany({
      where: {
        levelId,
        industryId: industryId || null,
      },
      orderBy: { quizNumber: 'asc' },
    });

    // Cache for 24 hours (static data)
    await setCache(cacheKey, quizzes, 86400);

    return c.json({ quizzes }, 200);
  } catch (error) {
    console.error("Error fetching prebuilt quizzes:", error);
    return c.json({ error: "Failed to fetch prebuilt quizzes" }, 500);
  }
}

/**
 * POST /api/prebuilt-quizzes/:prebuiltQuizId/start
 * Start a new prebuilt quiz attempt
 */
export async function startPrebuiltAttempt(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const prebuiltQuizId = c.req.param("prebuiltQuizId");

    if (!prebuiltQuizId) {
      return c.json({ error: "prebuiltQuizId is required" }, 400);
    }

    const attempt = await startPrebuiltQuizAttempt(userId, prebuiltQuizId);

    // Invalidate progress caches
    await Promise.all([
      invalidateCachePattern(`prebuilt:progress:${userId}:*`),
      invalidateCachePattern(`prebuilt:attempt:${userId}:${prebuiltQuizId}:*`),
    ]);

    return c.json({ attempt }, 201);
  } catch (error) {
    console.error("Error starting prebuilt quiz attempt:", error);
    return c.json({ error: "Failed to start prebuilt quiz attempt" }, 500);
  }
}

/**
 * POST /api/prebuilt-quizzes/attempts/:attemptId/answer
 * Record an answer for a prebuilt quiz attempt
 */
export async function recordPrebuiltAnswer(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const attemptId = c.req.param("attemptId");
    const { questionId, answerId } = await c.req.json();

    if (!attemptId || !questionId || !answerId) {
      return c.json(
        { error: "attemptId, questionId, and answerId are required" },
        400
      );
    }

    // Verify attempt belongs to user
    const attempt = await prisma.userQuizAttempt.findUnique({
      where: { id: attemptId },
      select: { userId: true },
    });

    if (!attempt || attempt.userId !== userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const result = await recordPrebuiltQuizAnswer(attemptId, questionId, answerId);

    // Invalidate progress caches
    await invalidateCachePattern(`prebuilt:progress:${userId}:*`);

    return c.json(result, 200);
  } catch (error) {
    console.error("Error recording prebuilt quiz answer:", error);
    return c.json({ error: "Failed to record answer" }, 500);
  }
}

/**
 * GET /api/prebuilt-quizzes/progress
 * Get user's apprenticeship progress across all levels and industries
 */
export async function getApprenticeshipProgress(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const cacheKey = `prebuilt:progress:${userId}`;
    const cached = await getFromCache<any[]>(cacheKey);

    if (cached) {
      return c.json({ progress: cached }, 200);
    }

    const progress = await getUserApprenticeshipProgress(userId);

    // Cache for 5 minutes
    await setCache(cacheKey, progress, 300);

    return c.json({ progress }, 200);
  } catch (error) {
    console.error("Error fetching apprenticeship progress:", error);
    return c.json({ error: "Failed to fetch progress" }, 500);
  }
}

/**
 * GET /api/prebuilt-quizzes/badges
 * Get user's earned badges
 */
export async function getBadges(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const cacheKey = `prebuilt:badges:${userId}`;
    const cached = await getFromCache<any[]>(cacheKey);

    if (cached) {
      return c.json({ badges: cached }, 200);
    }

    const badges = await getUserBadges(userId);

    // Cache for 5 minutes
    await setCache(cacheKey, badges, 300);

    return c.json({ badges }, 200);
  } catch (error) {
    console.error("Error fetching badges:", error);
    return c.json({ error: "Failed to fetch badges" }, 500);
  }
}

/**
 * GET /api/prebuilt-quizzes/users/:userId/badges
 * Get badges for a specific user (for viewing other users' profiles)
 */
export async function getUserBadgesById(c: Context) {
  const targetUserId = c.req.param("userId");
  const currentUserId = c.get("user")?.id;

  if (!currentUserId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!targetUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const cacheKey = `prebuilt:badges:${targetUserId}`;
    const cached = await getFromCache<any[]>(cacheKey);

    if (cached) {
      return c.json({ badges: cached }, 200);
    }

    const badges = await getUserBadges(targetUserId);

    // Cache for 5 minutes
    await setCache(cacheKey, badges, 300);

    return c.json({ badges }, 200);
  } catch (error) {
    console.error("Error fetching user badges:", error);
    return c.json({ error: "Failed to fetch user badges" }, 500);
  }
}

/**
 * GET /api/prebuilt-quizzes/:prebuiltQuizId/attempt
 * Get user's latest attempt for a specific prebuilt quiz
 */
export async function getPrebuiltQuizAttempt(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const prebuiltQuizId = c.req.param("prebuiltQuizId");

    const attempt = await prisma.userQuizAttempt.findFirst({
      where: {
        userId,
        prebuiltQuizId,
      },
      orderBy: { startedAt: 'desc' },
      include: {
        prebuiltAnswers: true,
        prebuiltQuiz: true,
      },
    });

    return c.json({ attempt }, 200);
  } catch (error) {
    console.error("Error fetching prebuilt quiz attempt:", error);
    return c.json({ error: "Failed to fetch attempt" }, 500);
  }
}

/**
 * GET /api/prebuilt-quizzes/:prebuiltQuizId/questions
 * Get questions for a prebuilt quiz (for display purposes)
 */
export async function getPrebuiltQuizQuestions(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const prebuiltQuizId = c.req.param("prebuiltQuizId");
    const userLanguage = getUserLanguageFromContext(c);

    // Get the quiz details
    const quiz = await prisma.prebuiltQuiz.findUnique({
      where: { id: prebuiltQuizId },
    });

    if (!quiz) {
      return c.json({ error: "Quiz not found" }, 404);
    }

    // Generate question IDs for preview
    const questionIds = await generatePrebuiltQuizQuestions(prebuiltQuizId);

    // Fetch actual question/flashcard data based on IDs
    const questions = [];

    for (const id of questionIds) {
      // Try to find as a question first
      let item = await prisma.question.findUnique({
        where: { id },
        include: {
          correctAnswer: true,
        },
      });

      if (item) {
        questions.push({
          id: item.id,
          type: 'question',
          prompt: (item as any)[`prompt${userLanguage.charAt(0).toUpperCase() + userLanguage.slice(1)}`],
          correctTermId: item.correctTermId,
        });
      } else {
        // It's a flashcard
        const flashcard = await prisma.flashcard.findUnique({
          where: { id },
        });

        if (flashcard) {
          questions.push({
            id: flashcard.id,
            type: 'flashcard',
            term: (flashcard as any)[`term${userLanguage.charAt(0).toUpperCase() + userLanguage.slice(1)}`],
            definition: (flashcard as any)[`definition${userLanguage.charAt(0).toUpperCase() + userLanguage.slice(1)}`],
          });
        }
      }
    }

    return c.json({
      quiz,
      questions,
      totalQuestions: quiz.questionsPerQuiz,
    }, 200);
  } catch (error) {
    console.error("Error fetching prebuilt quiz questions:", error);
    return c.json({ error: "Failed to fetch questions" }, 500);
  }
}

/**
 * GET /api/prebuilt-quizzes/available-badges
 * Get all available badges (for display in badge gallery)
 */
export async function getAvailableBadges(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const cacheKey = 'prebuilt:badges:all';
    const cached = await getFromCache<any[]>(cacheKey);

    if (cached) {
      return c.json({ badges: cached }, 200);
    }

    const badges = await prisma.badge.findMany({
      include: {
        level: true,
        industry: true,
      },
      orderBy: [
        { levelId: 'asc' },
        { industryId: 'asc' },
      ],
    });

    // Cache for 24 hours (static data)
    await setCache(cacheKey, badges, 86400);

    return c.json({ badges }, 200);
  } catch (error) {
    console.error("Error fetching available badges:", error);
    return c.json({ error: "Failed to fetch badges" }, 500);
  }
}
