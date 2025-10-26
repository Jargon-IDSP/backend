export interface UserWeeklyStats {
  id: string;
  userId: string;
  weekStartDate: Date;
  weeklyScore: number;
  daysActive: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWeeklyStatsDisplay {
  userId: string;
  weeklyScore: number;
  daysActive: string[];
  daysActiveCount: number;
  weekStartDate: Date;
  rank: number | null;
}

export interface WeeklyLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  email: string;
  weeklyScore: number;
  daysActive: string[];
  daysActiveCount: number;
}

export interface WeeklyStatistics {
  weekStart: Date;
  totalUsers: number;
  activeUsers: number;
  totalScore: number;
  averageScore: number;
  daysActiveDistribution: Record<number, number>;
}

export interface UserWeeklyProgress {
  currentWeek: UserWeeklyStats;
  rank: number | null;
  previousWeeks: UserWeeklyStats[];
}

export interface WeeklyStatsFilters {
  userId?: string;
  weekStartDate?: Date;
  minScore?: number;
  sortBy?: 'weeklyScore' | 'weekStartDate' | 'daysActive';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}