import type { Context } from "hono";
import {
  startQuizAttempt,
  recordQuizAnswer,
  getUserQuizAttempt,
  getUserQuizStats,
  getQuizAttempts,
  getUserInProgressAttempts,
  retryQuiz,
  getUserQuizHistory,
  getQuizWithLanguage,
  getQuizWithAnswers,
  getQuestionById,
  getQuestionAllLanguages,
  getQuizAllLanguages,
} from "./helperFunctions/quizHelper";
import { getUserLanguageFromContext } from "./helperFunctions/languageHelper";
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

export async function startAttempt(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { customQuizId } = await c.req.json();

    if (!customQuizId) {
      return c.json({ error: "customQuizId is required" }, 400);
    }

    const attempt = await startQuizAttempt(userId, customQuizId);

    // Invalidate quiz attempt caches after starting new attempt
    await Promise.all([
      invalidateCachePattern(`quiz:attempt:${userId}:${customQuizId}:*`),
      invalidateCachePattern(`quiz:attempts:inprogress:${userId}`),
      invalidateCachePattern(`quiz:stats:${userId}`),
    ]);

    return c.json({ attempt }, 201);
  } catch (error) {
    console.error("Error starting quiz attempt:", error);
    return c.json({ error: "Failed to start quiz attempt" }, 500);
  }
}

export async function getQuiz(c: Context) {
  const customQuizId = c.req.param("customQuizId");
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userLanguage = await getUserLanguageFromContext(c);

  try {
    // Handle synthetic quiz IDs from quick cache
    if (customQuizId.startsWith('quick-')) {
      console.log(`🔄 Detected synthetic quiz ID ${customQuizId}, checking quick cache`);
      const documentId = customQuizId.replace('quick-', '');

      const quickCacheKey = `flashcards:quick:${documentId}`;
      const quickCached = await redisClient.get(quickCacheKey);

      if (!quickCached) {
        console.log(`❌ Quick cache not found for document ${documentId}`);
        return c.json({ error: "Quiz not found - quick cache expired" }, 404);
      }

      const quickData = JSON.parse(quickCached);
      console.log(`✅ Found quick cache for document ${documentId}`);

      // Build enriched questions from quick cache
      const enrichedQuestions = quickData.questions.map((questionOut: any) => {
        const correctTermIndex = parseInt(questionOut.correctTermId) - 1;

        if (correctTermIndex < 0 || correctTermIndex >= quickData.terms.length) {
          console.error(`Invalid correctTermId: ${questionOut.correctTermId} for terms array of length ${quickData.terms.length}`);
          return null;
        }

        const correctTerm = quickData.terms[correctTermIndex];

        // Get the language we're querying for
        const lang = userLanguage?.toLowerCase() || 'english';

        // Build choices array with correct answer and 3 wrong answers
        const allTerms = quickData.terms.filter((_: any, index: number) => index !== correctTermIndex);
        const wrongTerms = allTerms.sort(() => 0.5 - Math.random()).slice(0, 3);

        const allChoices = [
          {
            term: correctTerm.term.term[lang] || correctTerm.term.term.english,
            isCorrect: true,
            termId: correctTerm.id,
          },
          ...wrongTerms.map((term: any) => ({
            term: term.term.term[lang] || term.term.term.english,
            isCorrect: false,
            termId: term.id,
          }))
        ];

        // Shuffle and assign letter IDs (A, B, C, D)
        const shuffledChoices = allChoices.sort(() => 0.5 - Math.random());
        const choices = shuffledChoices.map((choice, index) => ({
          ...choice,
          id: String.fromCharCode(65 + index), // A, B, C, D
        }));

        // Build prompts object with ALL available languages from quick cache
        // This allows translation button to work even if user's preference is different
        const prompts: Record<string, string> = {};
        const allLanguages = ['english', 'french', 'chinese', 'spanish', 'tagalog', 'punjabi', 'korean'];

        for (const language of allLanguages) {
          if (questionOut.prompt[language]) {
            prompts[language] = questionOut.prompt[language];
          }
        }

        console.log(`📝 Question ${questionOut.id} - Lang: ${lang}, Prompts:`, JSON.stringify(prompts));

        return {
          id: questionOut.id,
          prompt: questionOut.prompt[lang] || questionOut.prompt.english,
          prompts, // Include prompts for translation button
          choices,
          correctAnswer: correctTerm.term.term[lang] || correctTerm.term.term.english,
          category: questionOut.category,
        };
      }).filter(Boolean);

      const response = {
        quiz: {
          id: customQuizId,
          name: 'Quick Quiz',
          documentId,
          questions: enrichedQuestions,
          categoryId: quickData.categoryId,
          quickTranslation: true,
        },
        language: userLanguage,
      };

      return c.json(response);
    }

    // Regular database quiz lookup
    const cacheKey = `quiz:${customQuizId}:${userLanguage}:${userId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const quiz = await getQuizWithLanguage(customQuizId, userLanguage, userId);

    if (!quiz) {
      return c.json({ error: "Quiz not found" }, 404);
    }

    const response = { quiz, language: userLanguage };

    // Cache for 10 minutes (quiz content rarely changes)
    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return c.json({ error: "Failed to fetch quiz" }, 500);
  }
}

export async function translateQuiz(c: Context) {
  const customQuizId = c.req.param("customQuizId");
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Check cache first
    const cacheKey = `quiz:translate:${customQuizId}:${userId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const quiz = await getQuizAllLanguages(customQuizId, userId);

    if (!quiz) {
      return c.json({ error: "Quiz not found" }, 404);
    }

    const response = { quiz };

    // Cache for 10 minutes
    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error) {
    console.error("Error translating quiz:", error);
    return c.json({ error: "Failed to translate quiz" }, 500);
  }
}

export async function getQuestion(c: Context) {
  const questionId = c.req.param("questionId");

  const userLanguage = await getUserLanguageFromContext(c);

  try {
    // Check cache first
    const cacheKey = `quiz:question:${questionId}:${userLanguage}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const question = await getQuestionById(questionId, userLanguage);

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    const response = { question };

    // Cache for 10 minutes (questions rarely change)
    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching question:", error);
    return c.json({ error: "Failed to fetch question" }, 500);
  }
}

export async function translateQuestion(c: Context) {
  const questionId = c.req.param("questionId");

  try {
    // Check cache first
    const cacheKey = `quiz:question:translate:${questionId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const question = await getQuestionAllLanguages(questionId);

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    const response = { question };

    // Cache for 10 minutes
    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error) {
    console.error("Error translating question:", error);
    return c.json({ error: "Failed to translate question" }, 500);
  }
}

export async function submitAnswer(c: Context) {
  const userId = c.get("user")?.id;
  const attemptId = c.req.param("attemptId");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { questionId, answerId } = await c.req.json();

    if (!questionId || !answerId) {
      return c.json({ error: "questionId and answerId are required" }, 400);
    }

    const result = await recordQuizAnswer(attemptId, questionId, answerId);

    // Invalidate quiz attempt caches after submitting answer
    await Promise.all([
      invalidateCachePattern(`quiz:attempt:${userId}:*`),
      invalidateCachePattern(`quiz:stats:${userId}`),
      invalidateCachePattern(`quiz:attempts:*:${attemptId}`),
    ]);

    return c.json(result);
  } catch (error) {
    console.error("Error submitting answer:", error);
    return c.json({ error: "Failed to submit answer" }, 500);
  }
}

export async function getCurrentAttempt(c: Context) {
  const userId = c.get("user")?.id;
  const customQuizId = c.req.param("customQuizId");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Check cache first
    const cacheKey = `quiz:attempt:${userId}:${customQuizId}:current`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const attempt = await getUserQuizAttempt(userId, customQuizId, true);

    const response = { attempt };

    // Cache for 1 minute (attempt status changes frequently during quiz)
    await setCache(cacheKey, response, 60);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching current attempt:", error);
    return c.json({ error: "Failed to fetch current attempt" }, 500);
  }
}

export async function getStats(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Check cache first
    const cacheKey = `quiz:stats:${userId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const stats = await getUserQuizStats(userId);

    // Cache for 5 minutes
    await setCache(cacheKey, stats, 300);

    return c.json(stats);
  } catch (error) {
    console.error("Error fetching quiz stats:", error);
    return c.json({ error: "Failed to fetch quiz stats" }, 500);
  }
}

export async function getAllAttempts(c: Context) {
  const customQuizId = c.req.param("customQuizId");

  try {
    // Check cache first
    const cacheKey = `quiz:attempts:all:${customQuizId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const attempts = await getQuizAttempts(customQuizId);

    const response = { attempts };

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching quiz attempts:", error);
    return c.json({ error: "Failed to fetch quiz attempts" }, 500);
  }
}

export async function getInProgressAttempts(c: Context) {
  const userId = c.get("user")?.id;

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Check cache first
    const cacheKey = `quiz:attempts:inprogress:${userId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const attempts = await getUserInProgressAttempts(userId);

    const response = { attempts };

    // Cache for 1 minute (in-progress status changes frequently)
    await setCache(cacheKey, response, 60);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching in-progress attempts:", error);
    return c.json({ error: "Failed to fetch in-progress attempts" }, 500);
  }
}

export async function retryAttempt(c: Context) {
  const userId = c.get("user")?.id;
  const customQuizId = c.req.param("customQuizId");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const attempt = await retryQuiz(userId, customQuizId);

    // Invalidate quiz attempt caches after retry
    await Promise.all([
      invalidateCachePattern(`quiz:attempt:${userId}:${customQuizId}:*`),
      invalidateCachePattern(`quiz:attempts:inprogress:${userId}`),
      invalidateCachePattern(`quiz:history:${userId}:${customQuizId}`),
      invalidateCachePattern(`quiz:stats:${userId}`),
      invalidateCachePattern(`quiz:attempts:all:${customQuizId}`),
    ]);

    return c.json({ attempt }, 201);
  } catch (error) {
    console.error("Error retrying quiz:", error);
    return c.json({ error: "Failed to retry quiz" }, 500);
  }
}

export async function getAttemptHistory(c: Context) {
  const userId = c.get("user")?.id;
  const customQuizId = c.req.param("customQuizId");

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Check cache first
    const cacheKey = `quiz:history:${userId}:${customQuizId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const history = await getUserQuizHistory(userId, customQuizId);

    // Cache for 5 minutes
    await setCache(cacheKey, history, 300);

    return c.json(history);
  } catch (error) {
    console.error("Error fetching attempt history:", error);
    return c.json({ error: "Failed to fetch attempt history" }, 500);
  }
}
