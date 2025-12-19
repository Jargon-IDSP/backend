import type { Context } from "hono";
const prismaModule = (await import("@prisma/client")) as any;
const { PrismaClient } = prismaModule;
import {
  extractQueryParams,
  extractRouteParams,
  buildWhereClause,
  normalizeLanguage,
} from "./helperFunctions/flashcardHelper";
import {
  enrichQuestion,
  enrichCustomQuestion,
  enrichQuestionWithChoices,
  shuffleArray,
} from "./helperFunctions/questionHelper";
import {
  errorResponse,
  successResponse,
} from "./helperFunctions/responseHelper";
import { addWeeklyScore } from "./helperFunctions/weeklyTrackingHelper";
import redisClient from "../lib/redis";
import { prisma } from "../lib/prisma";

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

export const getQuestionsByLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language, industryId } = extractQueryParams(c);

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    // Check cache first
    const cacheKey = `questions:level:${levelId}:${language}:${
      industryId || "all"
    }`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const questions = await prisma.question.findMany({
      where: {
        correctAnswer: {
          levelId: parseInt(levelId),
          ...(industryId && { industryId: parseInt(industryId) }),
        },
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

    if (questions.length === 0) {
      return errorResponse(c, "No questions found for this level", 404);
    }

    const displayQuestions = questions.map((q: any) =>
      enrichQuestion(q, language)
    );

    const response = successResponse(displayQuestions, {
      count: questions.length,
      level_id: levelId,
      filters: { language, industry_id: industryId },
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching questions by level:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch questions by level",
      500
    );
  }
};

export const getRandomQuestion = async (c: Context) => {
  try {
    const { language, industryId, levelId } = extractQueryParams(c);

    const whereClause: any = {
      correctAnswer: {
        ...(levelId && { levelId: parseInt(levelId) }),
        ...(industryId && { industryId: parseInt(industryId) }),
      },
    };

    const totalQuestions = await prisma.question.count({ where: whereClause });

    if (totalQuestions === 0) {
      return errorResponse(c, "No questions found matching the criteria", 404);
    }

    const randomOffset = Math.floor(Math.random() * totalQuestions);
    const questions = await prisma.question.findMany({
      skip: randomOffset,
      take: 1,
      where: whereClause,
      include: {
        correctAnswer: {
          include: {
            level: true,
            industry: true,
          },
        },
      },
    });

    if (!questions || questions.length === 0) {
      return errorResponse(c, "No question found", 404);
    }

    const selectedQuestion = questions[0];

    const displayQuestion = await enrichQuestionWithChoices(
      prisma,
      selectedQuestion,
      language,
      false
    );

    return c.json(
      successResponse(displayQuestion, { selectedLanguage: language })
    );
  } catch (error: any) {
    console.error("Error fetching random question:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch random question",
      500
    );
  }
};

// Custom Questions

export const getCustomQuestionsByDocument = async (c: Context) => {
  try {
    const { documentId } = extractRouteParams(c);
    const { language } = extractQueryParams(c);

    if (!documentId) {
      return errorResponse(c, "Document ID is required", 400);
    }

    // Check regular cache first
    const cacheKey = `questions:document:${documentId}:${language}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    // Fetch from database
    const questions = await prisma.customQuestion.findMany({
      where: {
        correctAnswer: {
          documentId,
        },
      },
      include: {
        correctAnswer: {
          include: {
            document: true,
          },
        },
      },
    });

    // If no questions in DB yet, check quick cache (English + user's preferred language, available within ~15s)
    if (questions.length === 0) {
      const quickCacheKey = `flashcards:quick:${documentId}`;
      const quickCached = await redisClient.get(quickCacheKey);
      if (quickCached) {
        console.log(`⚡ Serving quick questions from cache for ${documentId}`);
        const quickData = JSON.parse(quickCached);

        // Map the cached questions to display format
        const displayQuestions = quickData.questions.map((questionOut: any) => {
          const lang = language?.toLowerCase() || 'english';
          return {
            id: questionOut.id,
            prompt: questionOut.prompt[lang] || questionOut.prompt.english,
            correctTermId: questionOut.correctTermId,
            category: questionOut.category,
            documentId: questionOut.documentId,
            userId: questionOut.userId,
            allLanguages: questionOut.prompt,
          };
        });

        return c.json(successResponse(displayQuestions, {
          count: displayQuestions.length,
          document_id: documentId,
          quickTranslation: true, // Flag to indicate this is partial data
        }));
      }

      return errorResponse(c, "No questions found for this document", 404);
    }

    const displayQuestions = questions.map((q: any) =>
      enrichCustomQuestion(q, language)
    );

    const response = successResponse(displayQuestions, {
      count: questions.length,
      document_id: documentId,
    });

    // Cache for 10 minutes
    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom questions by document:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom questions",
      500
    );
  }
};

export const getCustomQuestionsByUser = async (c: Context) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return errorResponse(c, "User not authenticated", 401);
    }

    const userId = user.id;
    const { language } = extractQueryParams(c);

    // Check cache first
    const cacheKey = `questions:user:${userId}:${language}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const questions = await prisma.customQuestion.findMany({
      where: { userId },
      include: {
        correctAnswer: {
          include: {
            document: true,
          },
        },
      },
    });

    const displayQuestions = questions.map((q: any) =>
      enrichCustomQuestion(q, language)
    );

    const response = successResponse(displayQuestions, {
      count: questions.length,
      user_id: userId,
    });

    // Cache for 2 minutes (user data changes more frequently)
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom questions by user:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom questions",
      500
    );
  }
};

export const getRandomCustomQuestion = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user?.id;
    const { language } = extractQueryParams(c);
    const documentId = c.req.query("document_id");

    if (!userId) {
      return errorResponse(c, "User ID is required", 400);
    }

    const whereClause = buildWhereClause({ userId, documentId });

    const totalQuestions = await prisma.customQuestion.count({
      where: whereClause,
    });

    if (totalQuestions === 0) {
      return errorResponse(c, "No custom questions found", 404);
    }

    const randomOffset = Math.floor(Math.random() * totalQuestions);
    const questions = await prisma.customQuestion.findMany({
      skip: randomOffset,
      take: 1,
      where: whereClause,
      include: {
        correctAnswer: {
          include: {
            document: true,
          },
        },
      },
    });

    if (!questions || questions.length === 0) {
      return errorResponse(c, "No question found", 404);
    }

    const selectedQuestion = questions[0];

    const displayQuestion = await enrichQuestionWithChoices(
      prisma,
      selectedQuestion,
      language,
      true
    );

    return c.json(
      successResponse(displayQuestion, { selectedLanguage: language })
    );
  } catch (error: any) {
    console.error("Error fetching random custom question:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch random custom question",
      500
    );
  }
};

// ==================== QUIZZES ====================

export const getQuizzesByLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language, industryId } = extractQueryParams(c);

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    // Check cache first
    const cacheKey = `quizzes:level:${levelId}:${language}:${
      industryId || "all"
    }`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const parsedLevelId = parseInt(levelId);
    const parsedIndustryId = industryId ? parseInt(industryId) : null;

    let industryQuestions: any[] = [];
    let generalQuestions: any[] = [];

    if (parsedIndustryId) {
      industryQuestions = await prisma.question.findMany({
        where: {
          correctAnswer: {
            levelId: parsedLevelId,
            industryId: parsedIndustryId,
          },
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
    }

    generalQuestions = await prisma.question.findMany({
      where: {
        correctAnswer: {
          levelId: parsedLevelId,
          industryId: null,
        },
      },
      include: {
        correctAnswer: {
          include: {
            level: true,
          },
        },
      },
    });

    const allQuestions = [...industryQuestions, ...generalQuestions];

    if (allQuestions.length === 0) {
      return errorResponse(c, "No questions available for this level", 404);
    }

    const totalQuizzes = Math.ceil(allQuestions.length / 10);

    const enrichedQuestions = await Promise.all(
      allQuestions.map(
        async (q) => await enrichQuestionWithChoices(prisma, q, language, false)
      )
    );

    const response = successResponse(enrichedQuestions, {
      count: enrichedQuestions.length,
      level_id: levelId,
      industry_id: industryId,
      total_quizzes: totalQuizzes,
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching quizzes by level:", error);
    return errorResponse(c, error.message || "Failed to fetch quizzes", 500);
  }
};

export const generateQuizForLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language, industryId } = extractQueryParams(c);
    const quizNumber = parseInt(c.req.query("quiz_number") || "1");

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    const parsedLevelId = parseInt(levelId);
    const parsedIndustryId = industryId ? parseInt(industryId) : null;

    let industryQuestions: any[] = [];

    if (parsedIndustryId) {
      industryQuestions = await prisma.question.findMany({
        where: {
          correctAnswer: {
            levelId: parsedLevelId,
            industryId: parsedIndustryId,
          },
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
    }

    const generalQuestions = await prisma.question.findMany({
      where: {
        correctAnswer: {
          levelId: parsedLevelId,
          industryId: null,
        },
      },
      include: {
        correctAnswer: {
          include: {
            level: true,
          },
        },
      },
    });

    const allQuestions = [...industryQuestions, ...generalQuestions];

    if (allQuestions.length === 0) {
      return errorResponse(c, "No questions available for this level", 404);
    }

    const shuffled = shuffleArray(allQuestions);
    let quizQuestions = shuffled.slice(0, 10);

    while (quizQuestions.length < 10 && allQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * allQuestions.length);
      quizQuestions.push(allQuestions[randomIndex]);
    }

    const enrichedQuestions = await Promise.all(
      quizQuestions.map(
        async (q) => await enrichQuestionWithChoices(prisma, q, language, false)
      )
    );

    return c.json(
      successResponse(enrichedQuestions, {
        quiz_number: quizNumber,
        level_id: levelId,
        industry_id: industryId,
        question_count: enrichedQuestions.length,
        total_available: allQuestions.length,
      })
    );
  } catch (error: any) {
    console.error("Error generating quiz for level:", error);
    return errorResponse(c, error.message || "Failed to generate quiz", 500);
  }
};

export const generateCustomQuiz = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user || !user.id) {
      return errorResponse(c, "User not authenticated", 401);
    }

    const userId = user.id;
    const { language } = extractQueryParams(c);
    const documentId = c.req.query("document_id");
    const quizNumber = parseInt(c.req.query("quiz_number") || "1");

    const whereClause: any = { userId };
    if (documentId) {
      whereClause.correctAnswer = { documentId };
    }

    const customQuestions = await prisma.customQuestion.findMany({
      where: whereClause,
      include: {
        correctAnswer: {
          include: {
            document: true,
          },
        },
      },
    });

    if (customQuestions.length === 0) {
      return errorResponse(c, "No custom questions found", 404);
    }

    const totalQuizzes = Math.ceil(customQuestions.length / 10);

    if (quizNumber > totalQuizzes) {
      return errorResponse(
        c,
        `Only ${totalQuizzes} quiz${
          totalQuizzes === 1 ? "" : "es"
        } available with your current questions`,
        400
      );
    }

    const shuffled = shuffleArray(customQuestions);
    const questionsForQuiz = shuffled.slice(
      0,
      Math.min(10, customQuestions.length)
    );

    const enrichedQuestions = await Promise.all(
      questionsForQuiz.map(
        async (q) => await enrichQuestionWithChoices(prisma, q, language, true)
      )
    );

    return c.json(
      successResponse(enrichedQuestions, {
        quiz_number: quizNumber,
        total_quizzes: totalQuizzes,
        question_count: enrichedQuestions.length,
        total_questions_available: customQuestions.length,
        document_id: documentId,
      })
    );
  } catch (error: any) {
    console.error("Error generating custom quiz:", error);
    return errorResponse(
      c,
      error.message || "Failed to generate custom quiz",
      500
    );
  }
};

export const completeQuiz = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user?.id;
    if (!userId) {
      return errorResponse(c, "Unauthorized", 401);
    }

    const {
      quizId,
      type,
      score,
      totalQuestions,
      levelId: requestLevelId,
      industryId,
      quizNumber,
    } = await c.req.json();

    console.log("Complete quiz request:", {
      userId,
      quizId,
      type,
      score,
      totalQuestions,
      requestLevelId,
      industryId,
      quizNumber,
    });

    if (!type || score === undefined || !totalQuestions) {
      return errorResponse(
        c,
        "Missing required fields: type, score, totalQuestions",
        400
      );
    }

    // Boss quizzes (quiz 3) earn 20 points per question, others earn 10
    const isBossQuiz = quizNumber === 3;
    const pointsPerQuestion = isBossQuiz ? 20 : 10;
    const pointsEarned = score * pointsPerQuestion;
    console.log("Points earned:", pointsEarned, "(Boss quiz:", isBossQuiz, ")");

    if (type === "existing") {
      if (!quizId || !requestLevelId) {
        return errorResponse(
          c,
          "Missing quizId or levelId for existing quiz",
          400
        );
      }

      const percentCorrect = Math.round((score / totalQuestions) * 100);

      // Find the prebuilt quiz based on levelId, industryId, and quizNumber
      let prebuiltQuiz = await prisma.prebuiltQuiz.findFirst({
        where: {
          levelId: parseInt(requestLevelId),
          quizNumber: quizNumber || 1,
          industryId: industryId || null,
        },
      });

      // If not found and industryId was provided, try with null (general quiz)
      if (!prebuiltQuiz && industryId !== undefined && industryId !== null) {
        prebuiltQuiz = await prisma.prebuiltQuiz.findFirst({
          where: {
            levelId: parseInt(requestLevelId),
            quizNumber: quizNumber || 1,
            industryId: null,
          },
        });
      }

      // If prebuilt quiz is not found, log a warning but still save the attempt
      // This allows points to be saved even if the prebuilt quiz record doesn't exist
      if (!prebuiltQuiz) {
        console.warn("Prebuilt quiz not found for:", {
          levelId: requestLevelId,
          quizNumber,
          industryId,
        }, "- Creating attempt without prebuiltQuizId");
      }

      const quizAttempt = await prisma.userQuizAttempt.create({
        data: {
          id: quizId,
          userId,
          prebuiltQuizId: prebuiltQuiz?.id || null,
          levelId: parseInt(requestLevelId),
          questionsAnswered: totalQuestions,
          questionsCorrect: score,
          totalQuestions,
          percentComplete: 100,
          percentCorrect,
          pointsEarned,
          maxPossiblePoints: totalQuestions * pointsPerQuestion,
          completed: true,
          completedAt: new Date(),
        },
      });

      console.log("Created quiz attempt:", quizAttempt.id, prebuiltQuiz ? "with prebuilt quiz" : "without prebuilt quiz");

      await prisma.user.update({
        where: { id: userId },
        data: {
          score: {
            increment: pointsEarned,
          },
        },
      });

      const now = new Date();
      const dayOfWeek = now.getUTCDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStartDate = new Date(now);
      weekStartDate.setUTCDate(now.getUTCDate() - daysToMonday);
      weekStartDate.setUTCHours(0, 0, 0, 0);

      await prisma.userWeeklyStats.upsert({
        where: {
          userId_weekStartDate: {
            userId,
            weekStartDate,
          },
        },
        update: {
          weeklyScore: {
            increment: pointsEarned,
          },
        },
        create: {
          userId,
          weekStartDate,
          weeklyScore: pointsEarned,
        },
      });

      console.log("Updated user score and weekly stats");

      // Award badges if this is a boss quiz (quiz 3) and user has completed all 3 quizzes
      if (quizNumber && industryId !== undefined) {
        await awardBadgesForCompletion(
          userId,
          parseInt(requestLevelId),
          industryId || null,
          quizNumber
        );
      }

      // Invalidate user-related caches after quiz completion
      await invalidateCachePattern(`questions:user:${userId}:*`);
      await invalidateCachePattern(`quizzes:user:${userId}:*`);
      // Note: No need to invalidate levels cache - we don't cache the levels endpoint anymore
      // Levels are fetched fresh on each request to ensure accurate accessibility status

      return c.json(successResponse({ quizAttempt, pointsEarned }));
    } else if (type === "custom") {
      const percentCorrect = Math.round((score / totalQuestions) * 100);

      let attempt = null;

      if (quizId) {
        console.log("Checking for custom quiz with ID:", quizId);
        const customQuiz = await prisma.customQuiz.findUnique({
          where: { id: quizId },
        });

        if (customQuiz) {
          console.log("Found custom quiz, creating attempt");
          attempt = await prisma.userQuizAttempt.create({
            data: {
              userId,
              customQuizId: quizId,
              questionsAnswered: totalQuestions,
              questionsCorrect: score,
              totalQuestions,
              percentComplete: 100,
              percentCorrect,
              pointsEarned,
              maxPossiblePoints: totalQuestions * 10,
              completed: true,
              completedAt: new Date(),
            },
          });
          console.log("Created quiz attempt:", attempt);
        } else {
          console.log("Custom quiz not found with ID:", quizId);
        }
      } else {
        console.log("No quizId provided for custom quiz");
      }
      console.log("Updating user score...");
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          score: {
            increment: pointsEarned,
          },
        },
      });
      console.log("Updated user score. New score:", updatedUser.score);

      const now = new Date();
      const dayOfWeek = now.getUTCDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStartDate = new Date(now);
      weekStartDate.setUTCDate(now.getUTCDate() - daysToMonday);
      weekStartDate.setUTCHours(0, 0, 0, 0);

      const weeklyStats = await prisma.userWeeklyStats.upsert({
        where: {
          userId_weekStartDate: {
            userId,
            weekStartDate,
          },
        },
        update: {
          weeklyScore: {
            increment: pointsEarned,
          },
        },
        create: {
          userId,
          weekStartDate,
          weeklyScore: pointsEarned,
        },
      });

      console.log("Updated weekly stats:", weeklyStats);

      // Invalidate user-related caches after custom quiz completion
      await invalidateCachePattern(`questions:user:${userId}:*`);
      await invalidateCachePattern(`quizzes:user:${userId}:*`);

      return c.json(
        successResponse({ attempt, pointsEarned, userScore: updatedUser.score })
      );
    }

    return errorResponse(c, "Invalid quiz type", 400);
  } catch (error: any) {
    console.error("Error completing quiz:", error);
    return errorResponse(c, error.message || "Failed to complete quiz", 500);
  }
};

// Utility functions for cache invalidation
export const invalidateQuestionCaches = async () => {
  await invalidateCachePattern("questions:*");
  await invalidateCachePattern("quizzes:*");
  console.log("🗑️  All question and quiz caches invalidated");
};

export const invalidateUserQuestionCaches = async (userId: string) => {
  await invalidateCachePattern(`questions:user:${userId}:*`);
  await invalidateCachePattern(`quizzes:user:${userId}:*`);
  console.log(`🗑️  Question and quiz caches invalidated for user: ${userId}`);
};

export const invalidateDocumentQuestionCaches = async (documentId: string) => {
  await invalidateCachePattern(`questions:document:${documentId}:*`);
  console.log(`🗑️  Question caches invalidated for document: ${documentId}`);
};

export const getCustomQuestionsByCategory = async (c: Context) => {
  try {
    const user = c.get("user");
    const { category } = c.req.param();
    const { language } = extractQueryParams(c);
    const lang = normalizeLanguage(language);

    if (!category) {
      return errorResponse(c, "Category is required", 400);
    }

    const categoryEnum =
      category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

    // Check cache first
    const cacheKey = `questions:category:${user.id}:${categoryEnum}:${lang}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const questions = await prisma.customQuestion.findMany({
      where: {
        userId: user.id,
        customQuiz: {
          category: categoryEnum as any,
        },
      },
      include: {
        correctAnswer: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Enrich questions with choices for quiz format
    const displayQuestions = await Promise.all(
      questions.map((q) => enrichQuestionWithChoices(prisma, q, lang, true))
    );

    const response = successResponse(displayQuestions, {
      count: questions.length,
      category: categoryEnum,
      selectedLanguage: lang,
    });

    // Cache for 2 minutes
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching custom questions by category:", error);
    return errorResponse(c, "Failed to fetch custom questions by category");
  }
};

export const getCustomQuizzesByCategory = async (c: Context) => {
  try {
    const user = c.get("user");
    const { category } = c.req.param();

    if (!category) {
      return errorResponse(c, "Category is required", 400);
    }

    const categoryEnum =
      category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

    // Check cache first
    const cacheKey = `quizzes:category:${user.id}:${categoryEnum}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const quizzes = await prisma.customQuiz.findMany({
      where: {
        userId: user.id,
        category: categoryEnum as any,
      },
      include: {
        document: true,
        questions: {
          include: {
            correctAnswer: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const response = successResponse(quizzes, {
      count: quizzes.length,
      category: categoryEnum,
    });

    // Cache for 2 minutes
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching custom quizzes by category:", error);
    return errorResponse(c, "Failed to fetch custom quizzes by category");
  }
};

export const getDocumentsByCategory = async (c: Context) => {
  try {
    const user = c.get("user");
    const { category } = c.req.param();

    if (!category) {
      return errorResponse(c, "Category is required", 400);
    }

    // Map default category names to IDs
    const categoryMap: Record<string, number> = {
      'safety': 1,
      'technical': 2,
      'training': 3,
      'workplace': 4,
      'professional': 5,
      'general': 6,
    };

    const categoryLower = category.toLowerCase();
    let categoryId = categoryMap[categoryLower];

    // If not a default category, look it up in the database
    if (!categoryId) {
      // Try exact match first (case-sensitive)
      let foundCategory = await prisma.category.findFirst({
        where: {
          OR: [
            { name: category, userId: user.id }, // User's custom category (exact match)
            { name: category, isDefault: true }, // Default category (exact match)
          ],
        },
        select: { id: true },
      });

      // If not found, try with capitalized first letter
      if (!foundCategory) {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        foundCategory = await prisma.category.findFirst({
          where: {
            OR: [
              { name: categoryName, userId: user.id }, // User's custom category
              { name: categoryName, isDefault: true }, // Default category
            ],
          },
          select: { id: true },
        });
      }

      if (!foundCategory) {
        return errorResponse(c, "Category not found", 404);
      }

      categoryId = foundCategory.id;
    }

    // Check cache first
    const cacheKey = `documents:category:${user.id}:${categoryId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    // Query documents by categoryId - only include fully processed documents
    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        categoryId: categoryId,
        ocrProcessed: true,
        flashcards: {
          some: {},
        },
        customQuizzes: {
          some: {
            questions: {
              some: {},
            },
          },
        },
      },
      select: {
        id: true,
        filename: true,
        ocrProcessed: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            flashcards: true,
            customQuizzes: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get question count for each document
    const documentsWithCounts = await Promise.all(
      documents.map(async (doc) => {
        const questionCount = await prisma.customQuestion.count({
          where: {
            customQuiz: {
              documentId: doc.id,
            },
          },
        });

        return {
          id: doc.id,
          filename: doc.filename,
          ocrProcessed: doc.ocrProcessed,
          category: doc.category.name,
          flashcardCount: doc._count.flashcards,
          questionCount: questionCount,
        };
      })
    );

    const response = successResponse(
      { documents: documentsWithCounts },
      {
        count: documentsWithCounts.length,
        category: category,
      }
    );

    // Cache for 2 minutes
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching documents by category:", error);
    return errorResponse(c, "Failed to fetch documents by category");
  }
};

export const getCustomQuizById = async (c: Context) => {
  try {
    const user = c.get("user");
    const { quizId } = c.req.param();
    const { language } = extractQueryParams(c);
    const lang = normalizeLanguage(language);

    if (!quizId) {
      return errorResponse(c, "Quiz ID is required", 400);
    }

    // Handle synthetic quiz IDs from quick cache
    if (quizId.startsWith('quick-')) {
      const documentId = quizId.replace('quick-', '');
      console.log(`🔄 Redirecting synthetic quiz ID ${quizId} to document quiz for ${documentId}`);

      // Check quick cache first
      const quickCacheKey = `flashcards:quick:${documentId}`;
      const quickCached = await redisClient.get(quickCacheKey);

      if (!quickCached) {
        return errorResponse(c, "Quiz not found - quick cache expired", 404);
      }

      const quickData = JSON.parse(quickCached);

      // Check if there's a quiz in DB now (quick cache might be old)
      const hasQuizInDb = await prisma.customQuiz.count({
        where: {
          documentId: documentId,
          userId: user.id,
        },
      });

      if (hasQuizInDb > 0) {
        // Redirect to the actual DB quiz
        const dbQuiz = await prisma.customQuiz.findFirst({
          where: {
            documentId: documentId,
            userId: user.id,
          },
        });
        console.log(`✅ DB quiz now exists for document ${documentId}, using quiz ID ${dbQuiz?.id}`);
        // Continue with normal flow using the real quiz ID
        return c.redirect(`/learning/custom/quiz/${dbQuiz?.id}?language=${language}`);
      }

      // Serve from quick cache
      console.log(`⚡ Serving quiz from quick cache for document ${documentId}`);
      console.log(`📊 Quick cache has ${quickData.terms?.length || 0} terms and ${quickData.questions?.length || 0} questions`);

      if (!quickData.questions || quickData.questions.length === 0) {
        return errorResponse(c, "No questions available in quick cache", 404);
      }

      // Build enriched questions from quick cache (same as getCustomQuizByDocument)
      const enrichedQuestions = quickData.questions.map((questionOut: any, index: number) => {
        const correctTermIndex = parseInt(questionOut.correctTermId) - 1;
        const correctTerm = quickData.terms[correctTermIndex];

        if (!correctTerm) {
          console.error(`⚠️ Missing correct term at index ${correctTermIndex} for question ${index}`);
          throw new Error(`Invalid question reference: term index ${correctTermIndex} not found`);
        }

        // Build the correct answer flashcard
        const correctAnswer: any = {
          id: correctTerm.id,
          term: correctTerm.term.term.english || '',
          definition: correctTerm.term.definition.english || '',
          documentId: correctTerm.term.documentId,
          userId: correctTerm.term.userId,
          category: correctTerm.term.category,
        };

        // Add native language if not English
        if (lang !== 'english' && correctTerm.term.term[lang]) {
          correctAnswer.nativeTerm = correctTerm.term.term[lang];
          correctAnswer.nativeDefinition = correctTerm.term.definition[lang] || '';
          correctAnswer.language = lang;
        }

        // Generate wrong choices from other terms
        const wrongChoices = quickData.terms
          .filter((_: any, i: number) => i !== correctTermIndex)
          .slice(0, 3)
          .map((term: any) => {
            const choice: any = {
              id: term.id,
              term: term.term.term.english || '',
              definition: term.term.definition.english || '',
            };

            if (lang !== 'english' && term.term.term[lang]) {
              choice.nativeTerm = term.term.term[lang];
              choice.nativeDefinition = term.term.definition[lang] || '';
              choice.language = lang;
            }

            return choice;
          });

        // Combine and shuffle choices
        const allChoices = [correctAnswer, ...wrongChoices].sort(() => Math.random() - 0.5);

        return {
          id: questionOut.id,
          prompt: questionOut.prompt[lang] || questionOut.prompt.english,
          correctAnswer,
          choices: allChoices,
          pointsWorth: 10,
          category: questionOut.category,
          documentId: questionOut.documentId,
          userId: questionOut.userId,
        };
      });

      return c.json(successResponse(enrichedQuestions, {
        quiz_id: quizId,
        quiz_name: 'Quick Quiz',
        category: quickData.categoryId,
        document_id: documentId,
        question_count: enrichedQuestions.length,
        selectedLanguage: lang,
        quickTranslation: true,
      }));
    }

    // Check cache first
    const cacheKey = `quiz:custom:${quizId}:${lang}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const quiz = await prisma.customQuiz.findUnique({
      where: {
        id: quizId,
        userId: user.id,
      },
      include: {
        document: true,
        user: {
          select: {
            defaultPrivacy: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        questions: {
          include: {
            correctAnswer: {
              include: {
                document: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      return errorResponse(c, "Quiz not found", 404);
    }

    if (quiz.questions.length === 0) {
      return errorResponse(c, "Quiz has no questions", 404);
    }

    const enrichedQuestions = await Promise.all(
      quiz.questions.map(
        async (q) => await enrichQuestionWithChoices(prisma, q, lang, true)
      )
    );

    const response = successResponse(enrichedQuestions, {
      quiz_id: quizId,
      quiz_name: quiz.name,
      category: quiz.category?.name || null,
      question_count: enrichedQuestions.length,
      selectedLanguage: lang,
      visibility: quiz.user.defaultPrivacy,
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching custom quiz by ID:", error);
    return errorResponse(c, "Failed to fetch custom quiz");
  }
};

export const getCustomQuizByDocument = async (c: Context) => {
  try {
    const user = c.get("user");
    const { documentId } = c.req.param();
    const { language } = extractQueryParams(c);
    const lang = normalizeLanguage(language);

    if (!documentId) {
      return errorResponse(c, "Document ID is required", 400);
    }

    // Check cache first
    const cacheKey = `quiz:document:${documentId}:${lang}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    // Check quick cache if no quiz in DB yet (English + user's preferred language, available within ~15s)
    const quickCacheKey = `flashcards:quick:${documentId}`;
    const quickCached = await redisClient.get(quickCacheKey);

    console.log(`🔍 Checking quick cache for document ${documentId}: ${quickCached ? 'FOUND' : 'NOT FOUND'}`);

    if (quickCached) {
      console.log(`⚡ Checking if we should serve quiz from quick cache for ${documentId}`);
      const quickData = JSON.parse(quickCached);

      // Only serve from quick cache if there's no quiz in DB yet
      const hasQuizInDb = await prisma.customQuiz.count({
        where: {
          documentId: documentId,
          userId: user.id,
        },
      });

      if (hasQuizInDb === 0 && quickData.questions && quickData.questions.length > 0) {
        console.log(`⚡ Serving quiz from quick cache for ${documentId}`);
        console.log(`📊 Quick cache has ${quickData.terms?.length || 0} terms and ${quickData.questions?.length || 0} questions`);

        // Build enriched questions from quick cache
        const enrichedQuestions = quickData.questions.map((questionOut: any, index: number) => {
          const correctTermIndex = parseInt(questionOut.correctTermId) - 1;
          const correctTerm = quickData.terms[correctTermIndex];

          if (!correctTerm) {
            console.error(`⚠️ Missing correct term at index ${correctTermIndex} for question ${index}`);
            console.error(`Question correctTermId: ${questionOut.correctTermId}, Total terms: ${quickData.terms.length}`);
            console.error(`All question IDs:`, quickData.questions.map((q: any) => q.correctTermId));
            console.error(`All term indices:`, quickData.terms.map((_: any, i: number) => i + 1));
            throw new Error(`Invalid question reference: term index ${correctTermIndex} not found`);
          }

          // Build the correct answer flashcard
          const correctAnswer: any = {
            id: correctTerm.id,
            term: correctTerm.term.term.english || '',
            definition: correctTerm.term.definition.english || '',
            documentId: correctTerm.term.documentId,
            userId: correctTerm.term.userId,
            category: correctTerm.term.category,
          };

          // Add native language if not English
          if (lang !== 'english' && correctTerm.term.term[lang]) {
            correctAnswer.nativeTerm = correctTerm.term.term[lang];
            correctAnswer.nativeDefinition = correctTerm.term.definition[lang] || '';
            correctAnswer.language = lang;
          }

          // Generate wrong choices from other terms
          const wrongChoices = quickData.terms
            .filter((_: any, i: number) => i !== correctTermIndex)
            .slice(0, 3)
            .map((term: any) => {
              const choice: any = {
                id: term.id,
                term: term.term.term.english || '',
                definition: term.term.definition.english || '',
              };

              if (lang !== 'english' && term.term.term[lang]) {
                choice.nativeTerm = term.term.term[lang];
                choice.nativeDefinition = term.term.definition[lang] || '';
                choice.language = lang;
              }

              return choice;
            });

          // Combine and shuffle choices
          const allChoices = [correctAnswer, ...wrongChoices].sort(() => Math.random() - 0.5);

          return {
            id: questionOut.id,
            prompt: questionOut.prompt[lang] || questionOut.prompt.english,
            correctAnswer,
            choices: allChoices,
            pointsWorth: 10,
            category: questionOut.category,
            documentId: questionOut.documentId,
            userId: questionOut.userId,
          };
        });

        return c.json(successResponse(enrichedQuestions, {
          quiz_id: 'quick-' + documentId,
          quiz_name: 'Quick Quiz',
          category: quickData.categoryId,
          document_id: documentId,
          question_count: enrichedQuestions.length,
          selectedLanguage: lang,
          quickTranslation: true,
        }));
      }
    }

    // Get the first quiz for this document from DB
    const quiz = await prisma.customQuiz.findFirst({
      where: {
        documentId: documentId,
        userId: user.id,
      },
      include: {
        document: true,
        category: {
          select: {
            name: true,
          },
        },
        questions: {
          include: {
            correctAnswer: {
              include: {
                document: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!quiz) {
      return errorResponse(c, "No quiz found for this document", 404);
    }

    if (quiz.questions.length === 0) {
      return errorResponse(c, "Quiz has no questions", 404);
    }

    const enrichedQuestions = await Promise.all(
      quiz.questions.map(
        async (q) => await enrichQuestionWithChoices(prisma, q, lang, true)
      )
    );

    const response = successResponse(enrichedQuestions, {
      quiz_id: quiz.id,
      quiz_name: quiz.name,
      category: quiz.category?.name || null,
      document_id: documentId,
      question_count: enrichedQuestions.length,
      selectedLanguage: lang,
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching custom quiz by document:", error);
    return errorResponse(c, "Failed to fetch custom quiz for document");
  }
};

export const getCustomQuizzesByDocument = async (c: Context) => {
  try {
    const { documentId } = extractRouteParams(c);
    const user = c.get("user");
    const userId = user?.id;

    if (!documentId) {
      return errorResponse(c, "Document ID is required", 400);
    }

    if (!userId) {
      return errorResponse(c, "User not authenticated", 401);
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { userId: true, filename: true },
    });

    if (!document) {
      return errorResponse(c, "Document not found", 404);
    }

    const isOwner = document.userId === userId;

    // Check cache first
    const cacheKey = `quizzes:document:${documentId}:${userId}:${isOwner}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const quizzes = await prisma.customQuiz.findMany({
      where: isOwner
        ? {
            documentId,
            userId,
          }
        : {
            documentId,
            sharedWith: {
              some: {
                sharedWithUserId: userId,
              },
            },
          },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
          },
        },
        _count: {
          select: {
            questions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // If no quizzes in DB but quick cache exists, return a synthetic quiz entry
    if (quizzes.length === 0 && isOwner) {
      const quickCacheKey = `flashcards:quick:${documentId}`;
      const quickCached = await redisClient.get(quickCacheKey);

      if (quickCached) {
        const quickData = JSON.parse(quickCached);
        console.log(`⚡ Found quick cache for document ${documentId}, returning synthetic quiz entry`);

        // Create a synthetic quiz entry that the frontend can use
        const syntheticQuiz = {
          id: `quick-${documentId}`,
          name: 'Quick Quiz',
          documentId,
          userId,
          categoryId: quickData.categoryId,
          pointsPerQuestion: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          document: {
            id: documentId,
            filename: document.filename || 'Document',
          },
          _count: {
            questions: quickData.questions?.length || 0,
          },
        };

        const response = successResponse([syntheticQuiz], {
          count: 1,
          document_id: documentId,
          user_id: userId,
          is_owner: isOwner,
          quickCache: true,
        });

        // Don't cache this since it's temporary
        return c.json(response);
      }
    }

    const response = successResponse(quizzes, {
      count: quizzes.length,
      document_id: documentId,
      user_id: userId,
      is_owner: isOwner,
    });

    // Cache for 2 minutes
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom quizzes by document:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom quizzes",
      500
    );
  }
};

export const getCustomQuizzesByUser = async (c: Context) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return errorResponse(c, "User not authenticated", 401);
    }

    const userId = user.id;

    // Check cache first
    const cacheKey = `quizzes:user:${userId}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const quizzes = await prisma.customQuiz.findMany({
      where: { userId },
      include: {
        document: true,
        questions: {
          include: {
            correctAnswer: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const response = successResponse(quizzes, {
      count: quizzes.length,
      user_id: userId,
    });

    // Cache for 2 minutes
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom quizzes by user:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom quizzes",
      500
    );
  }
};

/**
 * Get custom quiz count for a specific user
 * Returns the total count of all custom quizzes created by the user
 */
export const getCustomQuizCountByUser = async (c: Context) => {
  try {
    const userId = c.req.param("userId");

    if (!userId) {
      return errorResponse(c, "User ID is required", 400);
    }

    const count = await prisma.customQuiz.count({
      where: { userId },
    });

    return c.json({ success: true, data: { count } });
  } catch (error: any) {
    console.error("Error fetching custom quiz count by user:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom quiz count",
      500
    );
  }
};

/**
 * Get lesson names (custom quiz names) for a user
 * Returns only id and name, respecting lesson request access
 */
export const getUserLessonNames = async (c: Context) => {
  try {
    const currentUser = c.get("user");
    const currentUserId = currentUser.id;
    const targetUserId = c.req.param("userId");

    if (!targetUserId) {
      return errorResponse(c, "User ID is required", 400);
    }

    // If viewing own profile, return all lessons without restrictions
    if (currentUserId === targetUserId) {
      const lessons = await prisma.customQuiz.findMany({
        where: {
          userId: targetUserId,
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return c.json({ success: true, data: lessons });
    }

    // Check if they're friends (mutual follow)
    const yourFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    const theirFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: targetUserId,
          followingId: currentUserId,
        },
      },
    });

    const areFriends =
      yourFollow?.status === "FOLLOWING" &&
      theirFollow?.status === "FOLLOWING";

    // Get the target user's privacy setting
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { defaultPrivacy: true },
    });

    if (!targetUser) {
      return c.json({ success: false, error: "Target user not found" }, 404);
    }

    const privacy = targetUser.defaultPrivacy;

    console.log(`📋 getUserLessonNames: currentUser=${currentUserId}, targetUser=${targetUserId}`);
    console.log(`👥 areFriends=${areFriends}, Privacy=${privacy}`);
    console.log(`🔄 yourFollow=${yourFollow?.status}, theirFollow=${theirFollow?.status}`);

    // Build query conditions based on privacy settings and friendship status
    let whereCondition: any;

    if (privacy === "PUBLIC") {
      // PUBLIC: Everyone can see all lessons, unlocked
      whereCondition = { userId: targetUserId };
    } else if (privacy === "FRIENDS") {
      if (areFriends) {
        // FRIENDS + ARE FRIENDS: Show all lessons, unlocked
        whereCondition = { userId: targetUserId };
      } else {
        // FRIENDS + NOT FRIENDS: Show nothing (return empty array)
        whereCondition = {
          userId: targetUserId,
          id: "impossible-to-match",
        };
      }
    } else if (privacy === "PRIVATE") {
      if (areFriends) {
        // PRIVATE + ARE FRIENDS: Show all lessons (will be locked unless explicitly shared)
        whereCondition = { userId: targetUserId };
      } else {
        // PRIVATE + NOT FRIENDS: Show nothing (return empty array)
        whereCondition = {
          userId: targetUserId,
          id: "impossible-to-match",
        };
      }
    } else {
      // Unknown privacy setting - no access
      whereCondition = {
        userId: targetUserId,
        id: "impossible-to-match",
      };
    }

    console.log(`🔍 Query condition:`, JSON.stringify(whereCondition, null, 2));

    // Get lessons with share information
    const lessons = await prisma.customQuiz.findMany({
      where: whereCondition,
      select: {
        id: true,
        name: true,
        sharedWith: {
          where: {
            sharedWithUserId: currentUserId,
          },
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(`📚 Found ${lessons.length} lessons for ${privacy} privacy`);

    // Determine if lessons should be locked
    // Only PRIVATE + friends scenario requires locks
    const shouldShowLocks = privacy === "PRIVATE" && areFriends;

    return c.json({
      success: true,
      data: lessons.map(l => {
        // Check if there's an ACCEPTED share for this lesson
        const hasAcceptedShare = l.sharedWith.some(share => share.status === "ACCEPTED");

        return {
          id: l.id,
          name: l.name,
          // If PRIVATE and friends, lock lessons that don't have an ACCEPTED share
          isLocked: shouldShowLocks && !hasAcceptedShare,
        };
      })
    });
  } catch (error: any) {
    console.error("Error fetching user lesson names:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch lesson names",
      500
    );
  }
};

export const getLessonDetails = async (c: Context) => {
  try {
    const currentUser = c.get("user");
    const currentUserId = currentUser.id;
    const { userId, lessonId } = c.req.param();

    if (!userId || !lessonId) {
      return errorResponse(c, "User ID and Lesson ID are required", 400);
    }

    // Check if they're friends (mutual follow)
    const yourFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: userId,
        },
      },
    });

    const theirFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: currentUserId,
        },
      },
    });

    const areFriends =
      yourFollow?.status === "FOLLOWING" &&
      theirFollow?.status === "FOLLOWING";

    // Build query conditions based on access
    let whereCondition: any;

    if (currentUserId === userId) {
      // Return lesson details when viewing own lesson
      whereCondition = {
        id: lessonId,
        userId: userId,
      };
    } else {
      // Get the target user's privacy setting
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { defaultPrivacy: true },
      });

      if (!targetUser) {
        return c.json({ success: false, error: "User not found" }, 404);
      }

      const privacy = targetUser.defaultPrivacy;

      if (privacy === "PUBLIC") {
        // PUBLIC: Everyone can see
        whereCondition = {
          id: lessonId,
          userId: userId,
        };
      } else if (privacy === "FRIENDS" && areFriends) {
        // FRIENDS: Only friends can see, and we are friends
        whereCondition = {
          id: lessonId,
          userId: userId,
        };
      } else if (privacy === "PRIVATE") {
        // PRIVATE: Only if explicitly shared
        whereCondition = {
          id: lessonId,
          userId: userId,
          sharedWith: {
            some: {
              sharedWithUserId: currentUserId,
            },
          },
        };
      } else {
        // No access
        whereCondition = {
          id: lessonId,
          userId: userId,
          id: "impossible-to-match",
        };
      }
    }

    // Get lesson details
    const lesson = await prisma.customQuiz.findFirst({
      where: whereCondition,
      select: {
        id: true,
        name: true,
        category: {
          select: {
            name: true,
          },
        },
        pointsPerQuestion: true,
        createdAt: true,
        updatedAt: true,
        documentId: true,
        document: {
          select: {
            id: true,
            filename: true,
          },
        },
        _count: {
          select: {
            questions: true,
          },
        },
      },
    });

    if (!lesson) {
      return errorResponse(c, "Lesson not found or access denied", 404);
    }

    // Transform category object to string for frontend
    const lessonData = {
      ...lesson,
      category: lesson.category?.name || null,
    };

    return c.json({ success: true, data: lessonData });
  } catch (error: any) {
    console.error("Error fetching lesson details:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch lesson details",
      500
    );
  }
};

export const getAllCategories = async (c: Context) => {
  try {
    const user = c.get("user");

    // Check cache first
    const cacheKey = `categories:all:${user.id}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    // Get all categories with document counts for this user
    // Only count documents that are fully processed (have OCR done and have flashcards/questions)
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        isDefault: true,
        _count: {
          select: {
            documents: {
              where: {
                userId: user.id,
                ocrProcessed: true,
                flashcards: {
                  some: {},
                },
                customQuizzes: {
                  some: {
                    questions: {
                      some: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const categoriesWithCounts = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      isDefault: cat.isDefault,
      documentCount: cat._count.documents,
    }));

    const response = successResponse(
      { categories: categoriesWithCounts },
      {
        count: categoriesWithCounts.length,
      }
    );

    // Cache for shorter time (30 seconds) to show updates faster when documents finish processing
    await setCache(cacheKey, response, 30);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return errorResponse(c, "Failed to fetch categories");
  }
};

/**
 * Award badges when user completes a quiz
 * This mirrors the logic in prebuiltQuizHelper.ts but works with the existing quiz system
 */
async function awardBadgesForCompletion(
  userId: string,
  levelId: number,
  industryId: number | null,
  quizNumber: number
): Promise<void> {
  // Update apprenticeship progress
  const progress = await prisma.userApprenticeshipProgress.upsert({
    where: {
      userId_levelId_industryId: {
        userId,
        levelId,
        industryId: industryId || null,
      },
    },
    update: {
      quizzesCompleted: {
        increment: 1,
      },
    },
    create: {
      userId,
      levelId,
      industryId: industryId || null,
      quizzesCompleted: 1,
      isLevelComplete: false,
    },
  });

  console.log("Updated apprenticeship progress:", progress);

  // Check if level is complete (3 quizzes completed - boss quiz is quiz 3)
  if (progress.quizzesCompleted >= 3 && !progress.isLevelComplete) {
    await prisma.userApprenticeshipProgress.update({
      where: {
        userId_levelId_industryId: {
          userId,
          levelId,
          industryId: industryId || null,
        },
      },
      data: {
        isLevelComplete: true,
        completedAt: new Date(),
      },
    });

    console.log("Level completed! Awarding badge...");

    // Award level completion badge
    const levelBadge = await prisma.badge.findFirst({
      where: {
        levelId,
        industryId: industryId || null,
      },
    });

    if (levelBadge) {
      await prisma.userBadge.create({
        data: {
          userId,
          badgeId: levelBadge.id,
        },
      }).catch((error) => {
        // Ignore duplicate badge errors
        console.log("Badge already exists or error:", error.message);
      });

      // Invalidate badge cache so new badge shows up immediately
      await invalidateCachePattern(`prebuilt:badges:${userId}`);
      console.log("Badge awarded:", levelBadge.name);
    } else {
      console.log("No badge found for level:", levelId, "industry:", industryId);
    }
  }
}
