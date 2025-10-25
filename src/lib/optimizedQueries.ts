import { prisma } from "../lib/prisma";
import type { QuizCategory } from "../interfaces/customFlashcard";

// ============================================
// CUSTOM FLASHCARD QUERIES (with new indexes)
// ============================================

/**
 * Get custom flashcards sorted by quiz and language
 */
export async function getFlashcardsByQuiz(
  quizId: string,
  language: 'english' | 'french' | 'chinese' | 'spanish' | 'tagalog' | 'punjabi' | 'korean' = 'english'
) {
  const questions = await prisma.customQuestion.findMany({
    where: { customQuizId: quizId },
    include: {
      correctAnswer: true,
    },
    orderBy: { createdAt: 'asc' }, // Uses customQuizId + createdAt index
  });

  // Return with selected language
  return questions.map(q => ({
    id: q.id,
    prompt: q[`prompt${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof q],
    term: q.correctAnswer[`term${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof q.correctAnswer],
    definition: q.correctAnswer[`definition${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof q.correctAnswer],
  }));
}

/**
 * Get user's custom flashcards sorted by date
 */
export async function getUserCustomFlashcards(
  userId: string,
  limit: number = 50,
  offset: number = 0
) {
  return await prisma.customFlashcard.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }, // Uses userId + createdAt index
    take: limit,
    skip: offset,
    include: {
      document: {
        select: { filename: true },
      },
    },
  });
}

/**
 * Get custom flashcards by document, sorted by creation
 */
export async function getDocumentFlashcards(documentId: string) {
  return await prisma.customFlashcard.findMany({
    where: { documentId },
    orderBy: { createdAt: 'asc' }, // Uses documentId + createdAt index
  });
}

/**
 * Get quizzes by category
 */
export async function getQuizzesByCategory(
  userId: string,
  category: QuizCategory
) {
  return await prisma.customQuiz.findMany({
    where: {
      userId,
      category, // Uses category index
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

/**
 * Get all categories for a user with counts
 */
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

// ============================================
// PRE-BUILT FLASHCARD QUERIES (with new indexes)
// ============================================

/**
 * Get flashcards by level and industry (optimized with composite index)
 */
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
    // Uses levelId + industryId composite index
    include: {
      level: true,
      industry: true,
    },
  });

  // Return with selected language
  return flashcards.map(f => ({
    id: f.id,
    term: f[`term${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof f],
    definition: f[`definition${language.charAt(0).toUpperCase() + language.slice(1)}` as keyof typeof f],
    level: f.level.name,
    industry: f.industry?.name,
  }));
}

/**
 * Get questions by level (optimized)
 */
export async function getQuestionsByLevel(levelId: number) {
  // First get quizzes for this level
  const quizzes = await prisma.quiz.findMany({
    where: { levelId },
    select: { id: true },
  });

  const quizIds = quizzes.map(q => q.id);

  return await prisma.question.findMany({
    where: {
      quizId: { in: quizIds },
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

/**
 * Get questions by difficulty (uses difficulty index)
 */
export async function getQuestionsByDifficulty(
  difficulty: number,
  limit: number = 20
) {
  return await prisma.question.findMany({
    where: { difficulty }, // Uses difficulty index
    take: limit,
    include: {
      correctAnswer: true,
    },
  });
}

/**
 * Get flashcards by industry across all levels
 */
export async function getFlashcardsByIndustry(
  industryId: number,
  sortByLevel: boolean = true
) {
  return await prisma.flashcard.findMany({
    where: { industryId },
    orderBy: sortByLevel 
      ? { levelId: 'asc' } // Uses industryId + levelId composite index
      : { termEnglish: 'asc' },
    include: {
      level: true,
      industry: true,
    },
  });
}

// ============================================
// DOCUMENT TRANSLATION QUERIES
// ============================================

/**
 * Get or create document translation
 */
export async function getDocumentTranslation(documentId: string) {
  return await prisma.documentTranslation.findUnique({
    where: { documentId }, // Uses documentId index
  });
}

/**
 * Get document with translation in specific language
 */
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

// ============================================
// SEARCH AND FILTER EXAMPLES
// ============================================

/**
 * Advanced search: Custom flashcards with multiple filters
 */
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

  // Build where clause
  const where: any = { userId };
  
  if (documentId) {
    where.documentId = documentId;
  }

  if (searchTerm) {
    where.termEnglish = {
      contains: searchTerm,
    };
  }

  // If filtering by category, join through questions
  if (category) {
    where.questions = {
      some: {
        customQuiz: {
          category,
        },
      },
    };
  }

  // Build orderBy
  const orderBy = sortBy === 'date' 
    ? { createdAt: 'desc' as const }
    : { termEnglish: 'asc' as const };

  return await prisma.customFlashcard.findMany({
    where,
    orderBy, // Uses appropriate composite index
    take: limit,
    skip: offset,
    include: {
      document: {
        select: { filename: true },
      },
    },
  });
}

/**
 * Get user's quiz statistics by category
 */
export async function getUserQuizStats(userId: string) {
  const stats = await prisma.customQuiz.groupBy({
    by: ['category', 'completed'],
    where: { userId },
    _count: true,
    _avg: { score: true },
  });

  return stats;
}

/*
PERFORMANCE NOTES:

These queries are optimized using the new indexes:

1. Custom Content Sorting:
   - By quiz: customQuizId + createdAt
   - By user: userId + createdAt
   - By document: documentId + createdAt
   - By category: category index

2. Pre-built Content Sorting:
   - By level & industry: levelId + industryId composite
   - By industry & level: industryId + levelId composite
   - By difficulty: difficulty index

3. The composite indexes (level + industry) allow fast queries when:
   - Filtering by both: WHERE levelId = ? AND industryId = ?
   - Filtering by level only: WHERE levelId = ?
   - Sorting by level within industry: WHERE industryId = ? ORDER BY levelId

4. Document translations use unique constraint on documentId for O(1) lookups
*/