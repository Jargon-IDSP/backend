import type { Langs } from "./customFlashcard";

export interface Question {
  id: string;
  correctTermId: string;
  
  promptEnglish: string;
  promptFrench: string;
  promptChinese: string;
  promptSpanish: string;
  promptTagalog: string;
  promptPunjabi: string;
  promptKorean: string;
  
  difficulty: number;
  tags: string;
  points: number;
  quizId?: string | null;
}

export interface QuestionDisplay {
  id: string;
  prompt: {
    english: string;
    [key: string]: string;
  };
  correctTermId: string;
  difficulty: number;
  points: number;
}

export interface CustomQuestion {
  id: string;
  userId: string;
  customQuizId?: string | null;
  correctTermId: string;
  
  promptEnglish: string;
  promptFrench: string;
  promptChinese: string;
  promptSpanish: string;
  promptTagalog: string;
  promptPunjabi: string;
  promptKorean: string;
  
  pointsWorth: number; // ADDED: from new schema (default: 10)
  
  createdAt: Date;
}

export interface CustomQuestionDisplay {
  id: string;
  prompt: {
    english: string;
    [key: string]: string;
  };
  correctTermId: string;
  customQuizId?: string | null;
  pointsWorth: number; // ADDED
}

export interface QuestionFilters {
  quizId?: string;
  difficulty?: number;
  language?: Langs;
  sortBy?: 'difficulty' | 'points';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CustomQuestionFilters {
  userId?: string;
  customQuizId?: string;
  language?: Langs;
  sortBy?: 'createdAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}