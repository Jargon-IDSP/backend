import { prisma } from "../../lib/prisma";
import { addWeeklyScore } from "./weeklyTrackingHelper";

/**
 * Generate questions for a prebuilt quiz based on quiz type
 * Returns array of question IDs to use for the quiz
 */
export async function generatePrebuiltQuizQuestions(
  prebuiltQuizId: string
): Promise<string[]> {
  const quiz = await prisma.prebuiltQuiz.findUnique({
    where: { id: prebuiltQuizId },
  });

  if (!quiz) throw new Error("Prebuilt quiz not found");

  const { levelId, industryId, quizType, questionsPerQuiz } = quiz;

  switch (quizType) {
    case "TERM_TO_TRANSLATION":
      return await generateTermToTranslationQuestions(levelId, industryId, questionsPerQuiz);

    case "TRANSLATION_TO_DEFINITION":
      return await generateTranslationToDefinitionQuestions(levelId, industryId, questionsPerQuiz);

    case "MIXED_QUESTIONS":
      return await generateMixedQuestions(levelId, industryId, questionsPerQuiz);

    case "BOSS_QUIZ":
      return await generateBossQuizQuestions(levelId, industryId, questionsPerQuiz);

    default:
      throw new Error(`Unknown quiz type: ${quizType}`);
  }
}

/**
 * Quiz 1: TERM_TO_TRANSLATION
 * Match English term to translated term
 * Uses flashcard data - shows termEnglish, user picks correct translation
 */
async function generateTermToTranslationQuestions(
  levelId: number,
  industryId: number | null,
  count: number
): Promise<string[]> {
  // Get flashcards for this level and industry (or general)
  const flashcards = await prisma.flashcard.findMany({
    where: {
      levelId,
      industryId: industryId || null,
    },
    select: { id: true },
    take: count,
  });

  // If not enough industry-specific flashcards, pad with general flashcards
  if (flashcards.length < count) {
    const generalFlashcards = await prisma.flashcard.findMany({
      where: {
        levelId,
        industryId: null,
      },
      select: { id: true },
      take: count - flashcards.length,
    });

    flashcards.push(...generalFlashcards);
  }

  // Return flashcard IDs (they can be used as "questions" for this quiz type)
  return flashcards.map(f => f.id);
}

/**
 * Quiz 2: TRANSLATION_TO_DEFINITION
 * Match translated term to definition
 * Uses flashcard data - shows translation in user's language, user picks correct definition
 */
async function generateTranslationToDefinitionQuestions(
  levelId: number,
  industryId: number | null,
  count: number
): Promise<string[]> {
  // Same flashcards as Quiz 1, just different question format
  // Frontend will handle showing translation -> definition instead of term -> translation

  const flashcards = await prisma.flashcard.findMany({
    where: {
      levelId,
      industryId: industryId || null,
    },
    select: { id: true },
    take: count,
  });

  if (flashcards.length < count) {
    const generalFlashcards = await prisma.flashcard.findMany({
      where: {
        levelId,
        industryId: null,
      },
      select: { id: true },
      take: count - flashcards.length,
    });

    flashcards.push(...generalFlashcards);
  }

  return flashcards.map(f => f.id);
}

/**
 * Quiz 3-4: MIXED_QUESTIONS
 * Mix of actual Question records from the database
 * Allows repeating questions if not enough available
 */
async function generateMixedQuestions(
  levelId: number,
  industryId: number | null,
  count: number
): Promise<string[]> {
  // Get questions where the correct answer is from this level/industry
  const questions = await prisma.question.findMany({
    where: {
      correctAnswer: {
        levelId,
        industryId: industryId || null,
      },
    },
    select: { id: true },
  });

  // If not enough industry questions, add general questions
  if (questions.length < count) {
    const generalQuestions = await prisma.question.findMany({
      where: {
        correctAnswer: {
          levelId,
          industryId: null,
        },
      },
      select: { id: true },
      take: count - questions.length,
    });

    questions.push(...generalQuestions);
  }

  // If still not enough, repeat questions to fill the count
  const questionIds = questions.map(q => q.id);
  while (questionIds.length < count) {
    questionIds.push(...questionIds.slice(0, count - questionIds.length));
  }

  // Shuffle and return
  return shuffleArray(questionIds).slice(0, count);
}

/**
 * Quiz 5: BOSS_QUIZ
 * Final quiz with only questions - no flashcards
 * More challenging selection
 */
async function generateBossQuizQuestions(
  levelId: number,
  industryId: number | null,
  count: number
): Promise<string[]> {
  // Get questions where the correct answer is from this level/industry
  const questions = await prisma.question.findMany({
    where: {
      correctAnswer: {
        levelId,
        industryId: industryId || null,
      },
    },
    select: { id: true },
  });

  // If not enough industry questions, add general questions
  if (questions.length < count) {
    const generalQuestions = await prisma.question.findMany({
      where: {
        correctAnswer: {
          levelId,
          industryId: null,
        },
      },
      select: { id: true },
      take: count - questions.length,
    });

    questions.push(...generalQuestions);
  }

  // If still not enough, repeat questions to fill the count
  const questionIds = questions.map(q => q.id);
  while (questionIds.length < count) {
    questionIds.push(...questionIds.slice(0, count - questionIds.length));
  }

  // Shuffle and return
  return shuffleArray(questionIds).slice(0, count);
}

/**
 * Start a new attempt for a prebuilt quiz
 */
export async function startPrebuiltQuizAttempt(
  userId: string,
  prebuiltQuizId: string
): Promise<any> {
  const quiz = await prisma.prebuiltQuiz.findUnique({
    where: { id: prebuiltQuizId },
  });

  if (!quiz) throw new Error("Prebuilt quiz not found");

  // Check prerequisites for boss quiz (quiz 3)
  if (quiz.quizNumber === 3) {
    // Boss quiz requires completing quizzes 1 and 2 first
    const progress = await prisma.userApprenticeshipProgress.findUnique({
      where: {
        userId_levelId_industryId: {
          userId,
          levelId: quiz.levelId,
          industryId: quiz.industryId || null,
        },
      },
    });

    // User must have completed at least 2 quizzes before attempting boss quiz
    if (!progress || progress.quizzesCompleted < 2) {
      throw new Error("You must complete quizzes 1 and 2 before attempting the challenge quiz");
    }
  }

  // Generate questions for this attempt
  const questionIds = await generatePrebuiltQuizQuestions(prebuiltQuizId);

  const maxPossiblePoints = quiz.questionsPerQuiz * quiz.pointsPerQuestion;

  const attempt = await prisma.userQuizAttempt.create({
    data: {
      userId,
      prebuiltQuizId,
      levelId: quiz.levelId,
      questionIds: JSON.stringify(questionIds),
      totalQuestions: quiz.questionsPerQuiz,
      maxPossiblePoints,
      questionsAnswered: 0,
      questionsCorrect: 0,
      percentComplete: 0,
      percentCorrect: 0,
      pointsEarned: 0,
      completed: false,
      startedAt: new Date(),
    },
  });

  return attempt;
}

/**
 * Record an answer for a prebuilt quiz
 */
export async function recordPrebuiltQuizAnswer(
  attemptId: string,
  questionId: string,
  answerId: string
): Promise<{ isCorrect: boolean; pointsEarned: number }> {
  // Check if this is a flashcard-based question or a regular question
  let isCorrect = false;
  let pointsPerQuestion = 10;

  const attempt = await prisma.userQuizAttempt.findUnique({
    where: { id: attemptId },
    include: { prebuiltQuiz: true },
  });

  if (!attempt || !attempt.prebuiltQuiz) {
    throw new Error("Quiz attempt not found");
  }

  pointsPerQuestion = attempt.prebuiltQuiz.pointsPerQuestion;

  // Try to find as a regular question first
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { correctTermId: true },
  });

  if (question) {
    // It's a regular question - check if answer matches correctTermId
    isCorrect = answerId === question.correctTermId;
  } else {
    // It's a flashcard - the questionId IS the flashcard ID
    // For flashcard-based quizzes, the answerId should match the questionId (flashcard ID)
    isCorrect = answerId === questionId;
  }

  const pointsEarned = isCorrect ? pointsPerQuestion : 0;

  // Record the answer in PrebuiltQuizAnswer table
  await prisma.prebuiltQuizAnswer.create({
    data: {
      attemptId,
      questionId,
      answerId,
      isCorrect,
      pointsEarned,
      answeredAt: new Date(),
    },
  });

  await updatePrebuiltAttemptProgress(attemptId);

  return { isCorrect, pointsEarned };
}

/**
 * Update attempt progress and award points/badges when complete
 */
async function updatePrebuiltAttemptProgress(attemptId: string): Promise<void> {
  const attempt = await prisma.userQuizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      prebuiltAnswers: true,
      prebuiltQuiz: true,
    },
  });

  if (!attempt || !attempt.prebuiltQuiz) {
    throw new Error("Attempt not found");
  }

  const questionsAnswered = attempt.prebuiltAnswers.length;
  const questionsCorrect = attempt.prebuiltAnswers.filter((a) => a.isCorrect).length;
  const pointsEarned = attempt.prebuiltAnswers.reduce((sum, a) => sum + a.pointsEarned, 0);

  const percentComplete = Math.round((questionsAnswered / attempt.totalQuestions) * 100);
  const percentCorrect = questionsAnswered > 0
    ? Math.round((questionsCorrect / questionsAnswered) * 100)
    : 0;

  const completed = questionsAnswered >= attempt.totalQuestions;

  // For boss quizzes, check if they passed
  let passed = true;
  if (completed && attempt.prebuiltQuiz.passingScore) {
    passed = percentCorrect >= attempt.prebuiltQuiz.passingScore;
  }

  await prisma.userQuizAttempt.update({
    where: { id: attemptId },
    data: {
      questionsAnswered,
      questionsCorrect,
      pointsEarned,
      percentComplete,
      percentCorrect,
      completed,
      completedAt: completed ? new Date() : null,
    },
  });

  if (completed) {
    // Award points to user
    await prisma.user.update({
      where: { id: attempt.userId },
      data: {
        score: {
          increment: pointsEarned,
        },
      },
    });

    await addWeeklyScore(attempt.userId, pointsEarned);

    // Award badges and update apprenticeship progress
    await awardBadgesForCompletion(
      attempt.userId,
      attempt.prebuiltQuiz.levelId,
      attempt.prebuiltQuiz.industryId,
      attempt.prebuiltQuiz.quizNumber,
      attempt.prebuiltQuiz.quizType,
      passed
    );
  }
}

/**
 * Award badges when user completes a quiz
 */
async function awardBadgesForCompletion(
  userId: string,
  levelId: number,
  industryId: number | null,
  quizNumber: number,
  quizType: string,
  passed: boolean
): Promise<void> {
  // Only count quiz as completed if user passed (or there's no passing requirement)
  if (!passed) {
    console.log(`User ${userId} did not pass quiz ${quizNumber} for level ${levelId}, not counting towards progress`);
    return;
  }

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

  // Badge awarding is now only for level completion
  // "First Steps" and "Boss Slayer" badges have been removed from the system

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

    // Award level completion badge
    const levelBadge = await findLevelCompletionBadge(levelId, industryId);
    if (levelBadge) {
      await prisma.userBadge.create({
        data: {
          userId,
          badgeId: levelBadge.id,
        },
      }).catch(() => {}); // Ignore if already exists

      // Invalidate badge cache so new badge shows up immediately
      const { invalidateCachePattern } = await import("../../lib/redis");
      await invalidateCachePattern(`prebuilt:badges:${userId}`);
      console.log(`🏆 Badge awarded: ${levelBadge.name}`);
    }

    // No need to invalidate levels cache - levels endpoint doesn't cache anymore
    // Next level will unlock immediately on next fetch since backend calculates accessibility in real-time
    console.log(`✨ Level ${levelId} completed! Next level will be accessible immediately.`);
  }

  // Points milestone badges have been removed
}

/**
 * Find the appropriate level completion badge
 */
async function findLevelCompletionBadge(
  levelId: number,
  industryId: number | null
): Promise<any> {
  return await prisma.badge.findFirst({
    where: {
      levelId,
      industryId: industryId || null,
    },
  });
}

/**
 * Get user's apprenticeship progress
 */
export async function getUserApprenticeshipProgress(userId: string) {
  const progress = await prisma.userApprenticeshipProgress.findMany({
    where: { userId },
    include: {
      level: true,
      industry: true,
    },
    orderBy: [
      { levelId: 'asc' },
      { industryId: 'asc' },
    ],
  });

  return progress;
}

/**
 * Get user's badges
 */
export async function getUserBadges(userId: string) {
  const userBadges = await prisma.userBadge.findMany({
    where: { userId },
    include: {
      badge: true,
    },
    orderBy: { earnedAt: 'desc' },
  });

  return userBadges;
}

/**
 * Utility: Shuffle array
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
