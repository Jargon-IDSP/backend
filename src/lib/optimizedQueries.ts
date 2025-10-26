import { prisma } from "../lib/prisma";
import type { QuizCategory } from "../interfaces/customFlashcard";

export async function getFlashcardsByQuiz(
  quizId: string,
  language: 'english' | 'french' | 'chinese' | 'spanish' | 'tagalog' | 'punjabi' | 'korean' = 'english'
) {
  const questions = await prisma.customQuestion.findMany({
    where: { customQuizId: quizId },
    include: {
      correctAnswer: true,
    },
    orderBy: { createdAt: 'asc' }, 
  });


  return questions.map(q => ({
    id: q.id,
    prompt: q[`prompt${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof q],
    term: q.correctAnswer[`term${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof q.correctAnswer],
    definition: q.correctAnswer[`definition${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof q.correctAnswer],
  }));
}


export async function getUserCustomFlashcards(
  userId: string,
  limit: number = 50,
  offset: number = 0
) {
  return await prisma.customFlashcard.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }, 
    take: limit,
    skip: offset,
    include: {
      document: {
        select: { filename: true },
      },
    },
  });
}


export async function getDocumentFlashcards(documentId: string) {
  return await prisma.customFlashcard.findMany({
    where: { documentId },
    orderBy: { createdAt: 'asc' }, 
  });
}


export async function getQuizzesByCategory(
  userId: string,
  category: QuizCategory
) {
  return await prisma.customQuiz.findMany({
    where: {
      userId,
      category,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      document: {
        select: { filename: true },
      },
      _count: {
        select: { questions: true },
      },
    },
  });
}


export async function getUserQuizCategories(userId: string) {
  const quizzes = await prisma.customQuiz.groupBy({
    by: ['category'],
    where: {
      userId,
      category: { not: null },
    },
    _count: true,
  });

  return quizzes.map(q => ({
    category: q.category,
    count: q._count,
  }));
}


export async function getFlashcardsByLevelAndIndustry(
  levelId: number,
  industryId?: number,
  language: 'english' | 'french' | 'chinese' | 'spanish' | 'tagalog' | 'punjabi' | 'korean' = 'english'
) {
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

  return flashcards.map(f => ({
    id: f.id,
    term: f[`term${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof f],
    definition: f[`definition${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof f],
    level: f.level.name,
    industry: f.industry?.name,
  }));
}


export async function getQuestionsByLevel(levelId: number) {
  const flashcardsAtLevel = await prisma.flashcard.findMany({
    where: { levelId },
    select: { id: true },
  });

  const flashcardIds = flashcardsAtLevel.map(f => f.id);

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
}


export async function getQuestionsByDifficulty(
  difficulty: number,
  limit: number = 20
) {
  return await prisma.question.findMany({
    where: { difficulty }, 
    take: limit,
    include: {
      correctAnswer: true,
    },
  });
}


export async function getFlashcardsByIndustry(
  industryId: number,
  sortByLevel: boolean = true
) {
  return await prisma.flashcard.findMany({
    where: { industryId },
    orderBy: sortByLevel 
      ? { levelId: 'asc' } 
      : { termEnglish: 'asc' },
    include: {
      level: true,
      industry: true,
    },
  });
}


export async function getDocumentTranslation(documentId: string) {
  return await prisma.documentTranslation.findUnique({
    where: { documentId }, 
  });
}


export async function getDocumentInLanguage(
  documentId: string,
  language: 'english' | 'french' | 'chinese' | 'spanish' | 'tagalog' | 'punjabi' | 'korean' = 'english'
) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      translation: true,
    },
  });

  if (!doc) return null;

  const textField = `text${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof doc.translation;
  
  return {
    ...doc,
    translatedText: doc.translation?.[textField] || doc.extractedText,
  };
}

export async function searchCustomFlashcards(params: {
  userId: string;
  category?: QuizCategory;
  documentId?: string;
  searchTerm?: string;
  language?: string;
  sortBy?: 'date' | 'term';
  limit?: number;
  offset?: number;
}) {
  const {
    userId,
    category,
    documentId,
    searchTerm,
    sortBy = 'date',
    limit = 50,
    offset = 0,
  } = params;

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
    where.questions = {
      some: {
        customQuiz: {
          category,
        },
      },
    };
  }

  const orderBy = sortBy === 'date' 
    ? { createdAt: 'desc' as const }
    : { termEnglish: 'asc' as const };

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
}


export async function getUserQuizStats(userId: string) {
  const stats = await prisma.userQuizAttempt.groupBy({
    by: ['customQuizId'],
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
}
