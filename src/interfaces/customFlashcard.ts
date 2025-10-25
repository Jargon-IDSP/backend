export type Langs =
  | "english"
  | "french"
  | "chinese"
  | "spanish"
  | "tagalog"
  | "punjabi"
  | "korean";

export type QuizCategory =
  | "Safety"
  | "Technical"
  | "Training"
  | "Workplace"
  | "Professional"
  | "General";

export interface GenerateCustomFromOCROptions {
  ocrText: string;
  userId: string;
  documentId: string;
  existingDbTermsEnglish: string[];
}

export interface ExtractionResponse {
  terms: { english: string; definitionEnglish: string }[];
  questions: { promptEnglish: string; correctEnglish: string }[];
}

export interface TranslationResponse {
  terms: Array<{
    english: string;
    term: Partial<Record<Langs, string>>;
    definition: Partial<Record<Langs, string>>;
  }>;
  questions: Array<{ prompt: Partial<Record<Langs, string>> }>;
}

export interface TermOut {
  id: string;
  term: {
    term: Record<Langs, string>;
    definition: Record<Langs, string>;
    documentId: string;
    userId: string;
  };
}

export interface QuestionOut {
  id: string;
  correctTermId: string;
  prompt: Record<Langs, string>;
  documentId: string;
  userId: string;
}

export interface GenerateResult {
  terms: TermOut[];
  questions: QuestionOut[];
}

export interface CustomFlashcardData {
  id: string;
  documentId: string | null;
  userId: string;

  termEnglish: string;
  termFrench: string;
  termChinese: string;
  termSpanish: string;
  termTagalog: string;
  termPunjabi: string;
  termKorean: string;

  definitionEnglish: string;
  definitionFrench: string;
  definitionChinese: string;
  definitionSpanish: string;
  definitionTagalog: string;
  definitionPunjabi: string;
  definitionKorean: string;
}

export interface CustomQuestionData {
  id: string;
  userId: string;
  customQuizId: string | null;
  correctTermId: string;

  promptEnglish: string;
  promptFrench: string;
  promptChinese: string;
  promptSpanish: string;
  promptTagalog: string;
  promptPunjabi: string;
  promptKorean: string;
  
  pointsWorth: number; // ADDED: from new schema
}

export interface CustomFlashcardFilters {
  userId?: string;
  documentId?: string;
  customQuizId?: string;
  category?: QuizCategory;
  language?: Langs;
  searchTerm?: string;
  sortBy?: 'createdAt' | 'termEnglish';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CategoryInfo {
  value: QuizCategory;
  color: string;
}

export const CategoryInfo: Record<QuizCategory, CategoryInfo> = {
  Safety: {
    value: "Safety",
    color: "#EF4444",
  },
  Technical: {
    value: "Technical",
    color: "#3B82F6",
  },
  Training: {
    value: "Training",
    color: "#8B5CF6",
  },
  Workplace: {
    value: "Workplace",
    color: "#10B981",
  },
  Professional: {
    value: "Professional",
    color: "#F59E0B",
  },
  General: {
    value: "General",
    color: "#6B7280",
  }
};

export interface OCRData {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface OCRPage {
  pageNumber: number;
  text: string;
  confidence?: number;
}

export interface OCRResult {
  success: boolean;
  fullText?: string;
  pages?: OCRPage[];
  entities?: any[];
  tables?: any[];
  error?: string;
}

export interface DocumentTranslationData {
  id: string;
  documentId: string;
  userId: string;
  
  textEnglish: string;
  textFrench: string;
  textChinese: string;
  textSpanish: string;
  textTagalog: string;
  textPunjabi: string;
  textKorean: string;
  
  createdAt: Date;
  updatedAt: Date;
}