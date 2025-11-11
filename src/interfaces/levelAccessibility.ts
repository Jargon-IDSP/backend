export interface LevelProgress {
  levelId: number;
  isLevelComplete: boolean;
  quizzesCompleted: number;
}

export interface LevelAccessibility {
  levelId: number;
  isAccessible: boolean;
  isCompleted: boolean;
  quizzesCompleted: number;
  lockedReason?: string;
}

export interface QuizAccessibility {
  isAccessible: boolean;
  lockedReason?: string;
}
