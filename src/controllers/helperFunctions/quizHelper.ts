import { prisma } from "../../lib/prisma";
import type { UserQuizAttempt, UserQuizAnswer } from "../../interfaces/quizData";
import { addWeeklyScore } from "./weeklyTrackingHelper";
import { enrichQuestionWithChoices } from "./questionHelper";
import { canAccessQuiz } from "../quizShareController";
import {
  normalizeLanguage,
  transformQuestion,
  transformQuestions,
  getQuestionSelect,
  getCustomQuestionSelect,
  getAllQuestionLanguageFields,
  transformQuestionAllLanguages,
  transformFlashcard,
  getFlashcardSelect,
  getCustomFlashcardSelect,
} from "./languageHelper";


export async function startQuizAttempt(
  userId: string,
  customQuizId: string
): Promise<UserQuizAttempt> {
  const quiz = await prisma.customQuiz.findUnique({
    where: { id: customQuizId },
    include: {
      _count: { select: { questions: true } },
      questions: { select: { pointsWorth: true } },
    },
  });

  if (!quiz) throw new Error("Quiz not found");

  // Check access using new visibility system
  const hasAccess = await canAccessQuiz(userId, quiz);

  if (!hasAccess) {
    throw new Error("Unauthorized: You don't have access to this quiz");
  }

  const totalQuestions = quiz._count.questions;
  const maxPossiblePoints = quiz.questions.reduce((sum, q) => sum + q.pointsWorth, 0);

  const attempt = await prisma.userQuizAttempt.create({
    data: {
      userId,
      customQuizId,
      totalQuestions,
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


export async function recordQuizAnswer(
  attemptId: string,
  questionId: string,
  answerId: string
): Promise<{ isCorrect: boolean; pointsEarned: number }> {
  const question = await prisma.customQuestion.findUnique({
    where: { id: questionId },
    select: { correctTermId: true, pointsWorth: true },
  });

  if (!question) throw new Error("Question not found");

  const isCorrect = answerId === question.correctTermId;
  const pointsEarned = isCorrect ? question.pointsWorth : 0;

  await updateAttemptProgress(attemptId, isCorrect, pointsEarned);

  return { isCorrect, pointsEarned };
}

async function updateAttemptProgress(attemptId: string, isCorrect: boolean, pointsEarned: number): Promise<void> {
  const attempt = await prisma.userQuizAttempt.findUnique({
    where: { id: attemptId },
  });

  if (!attempt) throw new Error("Attempt not found");

  // Increment based on current answer
  const questionsAnswered = attempt.questionsAnswered + 1;
  const questionsCorrect = attempt.questionsCorrect + (isCorrect ? 1 : 0);
  const totalPointsEarned = attempt.pointsEarned + pointsEarned;

  const percentComplete = Math.round((questionsAnswered / attempt.totalQuestions) * 100);
  const percentCorrect = questionsAnswered > 0
    ? Math.round((questionsCorrect / questionsAnswered) * 100)
    : 0;

  const completed = questionsAnswered >= attempt.totalQuestions;

  await prisma.userQuizAttempt.update({
    where: { id: attemptId },
    data: {
      questionsAnswered,
      questionsCorrect,
      pointsEarned: totalPointsEarned,
      percentComplete,
      percentCorrect,
      completed,
      completedAt: completed ? new Date() : null,
    },
  });

  if (completed) {
    await prisma.user.update({
      where: { id: attempt.userId },
      data: {
        score: {
          increment: totalPointsEarned,
        },
      },
    });

    await addWeeklyScore(attempt.userId, totalPointsEarned);
  }
}


export async function getUserQuizAttempt(
  userId: string,
  customQuizId: string,
  getLatest: boolean = true
): Promise<UserQuizAttempt | null> {
  const attempt = await prisma.userQuizAttempt.findFirst({
    where: { userId, customQuizId },
    orderBy: { startedAt: 'desc' },
  });

  return attempt;
}

export async function retryQuiz(userId: string, customQuizId: string): Promise<UserQuizAttempt> {
  return await startQuizAttempt(userId, customQuizId);
}

export async function getUserQuizStats(userId: string) {
  const attempts = await prisma.userQuizAttempt.findMany({
    where: { userId },
    include: {
      customQuiz: {
        select: { category: true },
      },
    },
  });

  const totalAttempts = attempts.length;
  const completedAttempts = attempts.filter((a) => a.completed).length;
  const inProgressAttempts = totalAttempts - completedAttempts;

  const totalQuestionsAnswered = attempts.reduce((sum, a) => sum + a.questionsAnswered, 0);
  const totalQuestionsCorrect = attempts.reduce((sum, a) => sum + a.questionsCorrect, 0);
  const overallPercentCorrect = totalQuestionsAnswered > 0
    ? Math.round((totalQuestionsCorrect / totalQuestionsAnswered) * 100)
    : 0;

  const totalPointsEarned = attempts.reduce((sum, a) => sum + a.pointsEarned, 0);

  const averagePercentCorrect = completedAttempts > 0
    ? Math.round(
        attempts
          .filter((a) => a.completed)
          .reduce((sum, a) => sum + a.percentCorrect, 0) / completedAttempts
      )
    : 0;

  const averagePercentComplete = totalAttempts > 0
    ? Math.round(attempts.reduce((sum, a) => sum + a.percentComplete, 0) / totalAttempts)
    : 0;

  const byCategory: Record<string, any> = {};
  attempts.forEach((attempt) => {
    const cat = attempt.customQuiz?.category || "UNCATEGORIZED";
    if (!byCategory[cat]) {
      byCategory[cat] = {
        attempts: 0,
        completed: 0,
        totalCorrect: 0,
        totalAnswered: 0,
        totalPoints: 0,
      };
    }
    byCategory[cat].attempts++;
    if (attempt.completed) byCategory[cat].completed++;
    byCategory[cat].totalCorrect += attempt.questionsCorrect;
    byCategory[cat].totalAnswered += attempt.questionsAnswered;
    byCategory[cat].totalPoints += attempt.pointsEarned;
  });

  Object.keys(byCategory).forEach((cat) => {
    const stats = byCategory[cat];
    stats.averageCorrect =
      stats.totalAnswered > 0
        ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100)
        : 0;
    delete stats.totalCorrect;
    delete stats.totalAnswered;
  });

  return {
    totalAttempts,
    completedAttempts,
    inProgressAttempts,
    totalQuestionsAnswered,
    totalQuestionsCorrect,
    overallPercentCorrect,
    totalPointsEarned,
    averagePercentCorrect,
    averagePercentComplete,
    byCategory,
  };
}


export async function getUserQuizHistory(userId: string, customQuizId: string) {
  const attempts = await prisma.userQuizAttempt.findMany({
    where: { userId, customQuizId },
    orderBy: { startedAt: 'desc' },
  });

  if (attempts.length === 0) return null;

  const completed = attempts.filter(a => a.completed);
  const bestAttempt = completed.length > 0
    ? completed.reduce((best, current) => 
        current.pointsEarned > best.pointsEarned ? current : best
      )
    : null;

  return {
    attempts,
    totalAttempts: attempts.length,
    completedAttempts: completed.length,
    bestScore: bestAttempt?.pointsEarned || 0,
    bestPercentCorrect: bestAttempt?.percentCorrect || 0,
    latestAttempt: attempts[0],
  };
}

export async function getQuizAttempts(customQuizId: string) {
  return await prisma.userQuizAttempt.findMany({
    where: { customQuizId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function getUserInProgressAttempts(userId: string) {
  return await prisma.userQuizAttempt.findMany({
    where: {
      userId,
      completed: false,
      questionsAnswered: {
        gt: 0, 
      },
    },
    include: {
      customQuiz: {
        select: {
          name: true,
          category: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });
}


export async function getQuizWithInfo(quizId: string) {
  const quiz = await prisma.customQuiz.findUnique({
    where: { id: quizId },
    include: {
      document: {
        select: { 
          id: true,
          filename: true 
        },
      },
      _count: {
        select: { questions: true },
      },
      questions: {
        select: {
          id: true,
          promptEnglish: true,
          correctTermId: true,
          pointsWorth: true,
        },
      },
    },
  });

  if (!quiz) return null;

  return {
    ...quiz,
    totalQuestions: quiz._count.questions,
  };
}


export async function getQuizWithLanguage(quizId: string, userLanguage: string = "english", userId?: string) {
  const lang = normalizeLanguage(userLanguage);
  
  const quiz = await prisma.customQuiz.findUnique({
    where: { id: quizId },
    include: {
      document: {
        select: { 
          id: true,
          filename: true 
        },
      },
      _count: {
        select: { questions: true },
      },
      questions: {
        select: {
          ...getCustomQuestionSelect(lang),
          correctAnswer: {
            select: getCustomFlashcardSelect(lang),
          },
        },
      },
    },
  });

  if (!quiz) return null;

  if (userId) {
    const hasAccess = await canAccessQuiz(userId, quiz);

    if (!hasAccess) {
      return null;
    }
  }

  const enrichedQuestions = await Promise.all(
    quiz.questions.map(q => enrichQuestionWithChoices(prisma, q, lang, true))
  );

  return {
    id: quiz.id,
    name: quiz.name,
    category: quiz.category,
    pointsPerQuestion: quiz.pointsPerQuestion,
    document: quiz.document,
    totalQuestions: quiz._count.questions,
    questions: enrichedQuestions,
  };
}


export async function getQuizWithAnswers(quizId: string, userLanguage: string = "english") {
  const lang = normalizeLanguage(userLanguage);
  
  const quiz = await prisma.customQuiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        select: {
          ...getCustomQuestionSelect(lang),
          correctAnswer: {
            select: getCustomFlashcardSelect(lang),
          },
        },
      },
    },
  });

  if (!quiz) return null;

  const transformedQuestions = quiz.questions.map(q => ({
    ...transformQuestion(q, lang),
    correctAnswer: transformFlashcard(q.correctAnswer, lang),
  }));

  return {
    id: quiz.id,
    name: quiz.name,
    category: quiz.category,
    questions: transformedQuestions,
  };
}

export async function getQuestionById(questionId: string, userLanguage: string = "english") {
  const lang = normalizeLanguage(userLanguage);
  
  const question = await prisma.customQuestion.findUnique({
    where: { id: questionId },
    select: getCustomQuestionSelect(lang),
  });

  if (!question) return null;
  
  return transformQuestion(question, lang);
}

export async function getQuestionAllLanguages(questionId: string) {
  const question = await prisma.customQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      correctTermId: true,
      ...getAllQuestionLanguageFields(),
      pointsWorth: true,
      customQuizId: true,
    },
  });

  if (!question) return null;
  
  return transformQuestionAllLanguages(question);
}

export async function getQuizAllLanguages(quizId: string, userId?: string) {
  const quiz = await prisma.customQuiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        select: {
          id: true,
          correctTermId: true,
          ...getAllQuestionLanguageFields(),
          pointsWorth: true,
        },
      },
    },
  });

  if (!quiz) return null;

  if (userId) {
    const hasAccess = await canAccessQuiz(userId, quiz);

    if (!hasAccess) {
      return null;
    }
  }

  return {
    id: quiz.id,
    name: quiz.name,
    category: quiz.category,
    questions: quiz.questions.map(transformQuestionAllLanguages),
  };
}

export function calculatePercentComplete(
  answeredCount: number,
  totalQuestions: number
): number {
  if (totalQuestions === 0) return 0;
  return Math.round((answeredCount / totalQuestions) * 100);
}


export function calculatePercentCorrect(
  correctCount: number,
  answeredCount: number
): number {
  if (answeredCount === 0) return 0;
  return Math.round((correctCount / answeredCount) * 100);
}