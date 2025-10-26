import type { Langs, QuizCategory } from "./customFlashcard";

export interface Quiz {
  id: string;
  userId: string;
  levelId: number;
  completed: boolean;
  score: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface QuizDisplay {
  id: string;
  userId: string;
  levelId: number;
  completed: boolean;
  score: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface CustomQuizData {
  id: string;
  documentId: string | null;
  userId: string;
  name: string;
  category: QuizCategory | null;
  pointsPerQuestion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomQuizDisplay {
  id: string;
  documentId: string | null;
  userId: string;
  name: string;
  category: QuizCategory | null;
  pointsPerQuestion: number;
  questionCount: number;
  createdAt: Date;
}

export interface CustomQuizWithAttempt extends CustomQuizData {
  latestAttempt?: UserQuizAttempt | null;
}

export interface UserQuizAttempt {
  id: string;
  userId: string;
  customQuizId: string | null;
  levelId: number | null;
  
  questionsAnswered: number;
  questionsCorrect: number;
  totalQuestions: number;
  
  percentComplete: number;
  percentCorrect: number;
  
  pointsEarned: number;
  maxPossiblePoints: number;
  
  completed: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

export interface UserQuizAttemptDisplay {
  id: string;
  customQuizId: string;
  
  questionsAnswered: number;
  questionsCorrect: number;
  totalQuestions: number;
  
  percentComplete: number;
  percentCorrect: number;
  
  pointsEarned: number;
  maxPossiblePoints: number;
  
  completed: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

export interface CreateQuizAttemptInput {
  userId: string;
  customQuizId: string;
  totalQuestions: number;
  maxPossiblePoints: number;
}

export interface UpdateQuizAttemptInput {
  questionsAnswered?: number;
  questionsCorrect?: number;
  percentComplete?: number;
  percentCorrect?: number;
  pointsEarned?: number;
  completed?: boolean;
  completedAt?: Date;
}


export interface UserQuizAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  answerId: string;
  
  isCorrect: boolean;
  pointsEarned: number;
  
  answeredAt: Date;
}

export interface UserQuizAnswerDisplay {
  id: string;
  questionId: string;
  answerId: string;
  isCorrect: boolean;
  pointsEarned: number;
  answeredAt: Date;
}

export interface CreateQuizAnswerInput {
  attemptId: string;
  questionId: string;
  answerId: string;
  isCorrect: boolean;
  pointsEarned: number;
}


export interface CustomQuizShare {
  id: string;
  customQuizId: string;
  sharedWithUserId: string;
  sharedAt: Date;
}

export interface CustomQuizShareDisplay {
  id: string;
  customQuizId: string;
  sharedWithUserId: string;
  sharedWithUser?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  };
  sharedAt: Date;
}


export interface QuizFilters {
  userId?: string;
  levelId?: number;
  completed?: boolean;
  sortBy?: 'createdAt' | 'score';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CustomQuizFilters {
  userId?: string;
  documentId?: string;
  category?: QuizCategory;
  sortBy?: 'createdAt' | 'name' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface QuizAttemptFilters {
  userId?: string;
  customQuizId?: string;
  completed?: boolean;
  sortBy?: 'startedAt' | 'completedAt' | 'percentCorrect' | 'pointsEarned';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}


export interface QuizStatistics {
  totalAttempts: number;
  completedAttempts: number;
  averageScore: number;
  averagePercentCorrect: number;
  bestScore: number;
  totalPointsEarned: number;
  totalQuestionsAnswered: number;
  totalQuestionsCorrect: number;
}

export interface UserQuizProgress {
  customQuizId: string;
  quizName: string;
  attempts: UserQuizAttempt[];
  bestAttempt?: UserQuizAttempt;
  latestAttempt?: UserQuizAttempt;
  statistics: QuizStatistics;
}