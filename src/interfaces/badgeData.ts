export interface BadgeData {
  code: string;
  name: string;
  description: string;
  iconUrl?: string | null;
  levelId?: number | null;
  industryId?: number | null;
}

export interface QuizTemplateData {
  id: string;
  levelId: number;
  quizNumber: number;
  name: string;
  description?: string;
  quizType: 'TERM_TO_TRANSLATION' | 'TRANSLATION_TO_DEFINITION' | 'MIXED_QUESTIONS' | 'BOSS_QUIZ';
  questionsPerQuiz: number;
  allowAIHelp: boolean;
  allowTranslation: boolean;
  allowBackNavigation: boolean;
  pointsPerQuestion: number;
  requiredToUnlock: boolean;
  passingScore?: number;
}
