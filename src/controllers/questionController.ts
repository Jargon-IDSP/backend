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
  generateCacheKey,
  withCache,
} from "./helperFunctions/cacheHelper";
import {
  errorResponse,
  successResponse,
} from "./helperFunctions/responseHelper";

import { prisma } from '../lib/prisma';


export const getQuestionsByLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language, industryId } = extractQueryParams(c);

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    const cacheKey = generateCacheKey("questions-level", { levelId, language, industryId });

    const response = await withCache(cacheKey, async () => {
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
        throw new Error("No questions found for this level");
      }

      const displayQuestions = questions.map((q: any) => enrichQuestion(q, language));

      return successResponse(displayQuestions, {
        count: questions.length,
        level_id: levelId,
        filters: { language, industry_id: industryId },
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching questions by level:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch questions by level",
      error.message === "No questions found for this level" ? 404 : 500
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

    return c.json(successResponse(displayQuestion, { selectedLanguage: language }));
  } catch (error: any) {
    console.error("Error fetching random question:", error);
    return errorResponse(c, error.message || "Failed to fetch random question", 500);
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

    const cacheKey = generateCacheKey("custom-questions-document", { documentId, language });

    const response = await withCache(cacheKey, async () => {
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

      if (questions.length === 0) {
        throw new Error("No questions found for this document");
      }

      const displayQuestions = questions.map((q: any) => enrichCustomQuestion(q, language));

      return successResponse(displayQuestions, {
        count: questions.length,
        document_id: documentId,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom questions by document:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom questions",
      error.message === "No questions found for this document" ? 404 : 500
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

    const cacheKey = generateCacheKey("custom-questions-user", { userId, language });

    const response = await withCache(cacheKey, async () => {
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

      const displayQuestions = questions.map((q: any) => enrichCustomQuestion(q, language));

      return successResponse(displayQuestions, {
        count: questions.length,
        user_id: userId,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom questions by user:", error);
    return errorResponse(c, error.message || "Failed to fetch custom questions", 500);
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

    const totalQuestions = await prisma.customQuestion.count({ where: whereClause });

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

    return c.json(successResponse(displayQuestion, { selectedLanguage: language }));
  } catch (error: any) {
    console.error("Error fetching random custom question:", error);
    return errorResponse(c, error.message || "Failed to fetch random custom question", 500);
  }
};

// ==================== QUIZZES ====================

export const getQuizzesByLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const user = c.get("user");
    const userId = user?.id;

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    if (!userId) {
      return errorResponse(c, "User not authenticated", 401);
    }

    const cacheKey = generateCacheKey("quizzes-level", { levelId, userId });

    const response = await withCache(cacheKey, async () => {
      const quizAttempts = await prisma.userQuizAttempt.findMany({
        where: {
          levelId: parseInt(levelId),
          userId,
        },
        include: {
          level: true,
        },
        orderBy: {
          startedAt: 'desc',
        },
      });

      return successResponse(quizAttempts, {
        count: quizAttempts.length,
        level_id: levelId,
        user_id: userId,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching quizzes by level:", error);
    return errorResponse(c, error.message || "Failed to fetch quizzes", 500);
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

    // First check if user owns the document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { userId: true },
    });

    if (!document) {
      return errorResponse(c, "Document not found", 404);
    }

    const isOwner = document.userId === userId;

    const cacheKey = generateCacheKey("custom-quizzes-document", { documentId, userId, isOwner });

    const response = await withCache(cacheKey, async () => {
      // Get all quizzes for this document
      const quizzes = await prisma.customQuiz.findMany({
        where: isOwner ? {
          documentId,
          userId,
        } : {
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
          createdAt: 'desc',
        },
      });

      return successResponse(quizzes, {
        count: quizzes.length,
        document_id: documentId,
        user_id: userId,
        is_owner: isOwner,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom quizzes by document:", error);
    return errorResponse(c, error.message || "Failed to fetch custom quizzes", 500);
  }
};

export const getCustomQuizzesByUser = async (c: Context) => {
  try {
    const user = c.get("user");
    
    if (!user || !user.id) {
      return errorResponse(c, "User not authenticated", 401);
    }
    
    const userId = user.id;

    const cacheKey = generateCacheKey("custom-quizzes-user", { userId });

    const response = await withCache(cacheKey, async () => {
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
          createdAt: 'desc',
        },
      });

      return successResponse(quizzes, {
        count: quizzes.length,
        user_id: userId,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom quizzes by user:", error);
    return errorResponse(c, error.message || "Failed to fetch custom quizzes", 500);
  }
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

    const categoryEnum = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

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
        createdAt: 'desc',
      },
    });

    const displayQuestions = questions.map(q => enrichCustomQuestion(q, lang));

    const response = successResponse(displayQuestions, {
      count: questions.length,
      category: categoryEnum,
      selectedLanguage: lang,
    });

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

    const categoryEnum = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

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
        createdAt: 'desc',
      },
    });

    return c.json(successResponse(quizzes, {
      count: quizzes.length,
      category: categoryEnum,
    }));
  } catch (error) {
    console.error("Error fetching custom quizzes by category:", error);
    return errorResponse(c, "Failed to fetch custom quizzes by category");
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

    const quiz = await prisma.customQuiz.findUnique({
      where: {
        id: quizId,
        userId: user.id,
      },
      include: {
        document: true,
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
      quiz.questions.map(async (q) => 
        await enrichQuestionWithChoices(prisma, q, lang, true)
      )
    );

    return c.json(successResponse(enrichedQuestions, {
      quiz_id: quizId,
      quiz_name: quiz.name,
      category: quiz.category,
      question_count: enrichedQuestions.length,
      selectedLanguage: lang,
    }));
  } catch (error) {
    console.error("Error fetching custom quiz by ID:", error);
    return errorResponse(c, "Failed to fetch custom quiz");
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

    if (quizNumber < 1 || quizNumber > 5) {
      return errorResponse(c, "Quiz number must be between 1 and 5", 400);
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
      quizQuestions.map(async (q) => 
        await enrichQuestionWithChoices(prisma, q, language, false)
      )
    );

    return c.json(successResponse(enrichedQuestions, {
      quiz_number: quizNumber,
      level_id: levelId,
      industry_id: industryId,
      question_count: enrichedQuestions.length,
      total_available: allQuestions.length,
    }));
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
        `Only ${totalQuizzes} quiz${totalQuizzes === 1 ? '' : 'es'} available with your current questions`,
        400
      );
    }

    const shuffled = shuffleArray(customQuestions);
    const questionsForQuiz = shuffled.slice(0, Math.min(10, customQuestions.length));

    const enrichedQuestions = await Promise.all(
      questionsForQuiz.map(async (q) => 
        await enrichQuestionWithChoices(prisma, q, language, true)
      )
    );

    return c.json(successResponse(enrichedQuestions, {
      quiz_number: quizNumber,
      total_quizzes: totalQuizzes,
      question_count: enrichedQuestions.length,
      total_questions_available: customQuestions.length,
      document_id: documentId,
    }));
  } catch (error: any) {
    console.error("Error generating custom quiz:", error);
    return errorResponse(c, error.message || "Failed to generate custom quiz", 500);
  }
};

export const completeQuiz = async (c: Context) => {
  try {
    const user = c.get('user');
    const userId = user?.id;
    if (!userId) {
      return errorResponse(c, 'Unauthorized', 401);
    }

    const { quizId, type, score, totalQuestions, levelId: requestLevelId } = await c.req.json();

    console.log('Complete quiz request:', { userId, quizId, type, score, totalQuestions, requestLevelId });

    if (!type || score === undefined || !totalQuestions) {
      return errorResponse(c, 'Missing required fields: type, score, totalQuestions', 400);
    }

    const pointsEarned = score * 5; 
    console.log('Points earned:', pointsEarned);

    if (type === 'existing') {
      if (!quizId || !requestLevelId) {
        return errorResponse(c, 'Missing quizId or levelId for existing quiz', 400);
      }

      const percentCorrect = Math.round((score / totalQuestions) * 100);

      const quizAttempt = await prisma.userQuizAttempt.create({
        data: {
          id: quizId, 
          userId,
          levelId: parseInt(requestLevelId),
          questionsAnswered: totalQuestions,
          questionsCorrect: score,
          totalQuestions,
          percentComplete: 100,
          percentCorrect,
          pointsEarned,
          maxPossiblePoints: totalQuestions * 5,
          completed: true,
          completedAt: new Date(),
        },
      });

      console.log('Created quiz attempt for prebuilt quiz:', quizAttempt);

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

      console.log('Updated user score and weekly stats');
      return c.json(successResponse({ quizAttempt, pointsEarned }));
    } else if (type === 'custom') {
      const percentCorrect = Math.round((score / totalQuestions) * 100);
      
      let attempt = null;
      
      if (quizId) {
        console.log('Checking for custom quiz with ID:', quizId);
        const customQuiz = await prisma.customQuiz.findUnique({
          where: { id: quizId },
        });

        if (customQuiz) {
          console.log('Found custom quiz, creating attempt');
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
          console.log('Created quiz attempt:', attempt);
        } else {
          console.log('Custom quiz not found with ID:', quizId);
        }
      } else {
        console.log('No quizId provided for custom quiz');
      }
      console.log('Updating user score...');
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          score: {
            increment: pointsEarned,
          },
        },
      });
      console.log('Updated user score. New score:', updatedUser.score);

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

      console.log('Updated weekly stats:', weeklyStats);
      return c.json(successResponse({ attempt, pointsEarned, userScore: updatedUser.score }));
    }

    return errorResponse(c, 'Invalid quiz type', 400);
  } catch (error: any) {
    console.error('Error completing quiz:', error);
    return errorResponse(c, error.message || 'Failed to complete quiz', 500);
  }
};