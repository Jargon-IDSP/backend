import { prisma } from "../../lib/prisma";
import type { LevelAccessibility, QuizAccessibility } from "../../interfaces/levelAccessibility";

/**
 * Determine if a level is accessible to a user based on their progress
 *
 * Rules:
 * - Level 1 is always accessible
 * - Level 2+ requires the previous level to be completed (all 3 quizzes passed, including boss quiz)
 *
 * @param levelId - The level to check accessibility for
 * @param progressMap - Map of level progress by levelId
 * @returns Object with accessibility status and details
 */
export function isLevelAccessible(
  levelId: number,
  progressMap: Map<number, { completed: boolean; quizzesCompleted: number }>
): LevelAccessibility {
  const progress = progressMap.get(levelId);

  // Level 1 is always accessible
  if (levelId === 1) {
    return {
      levelId,
      isAccessible: true,
      isCompleted: progress?.completed || false,
      quizzesCompleted: progress?.quizzesCompleted || 0,
    };
  }

  // For levels 2+, check if previous level is complete
  const previousLevelId = levelId - 1;
  const previousLevelProgress = progressMap.get(previousLevelId);
  const isPreviousLevelComplete = previousLevelProgress?.completed || false;

  if (!isPreviousLevelComplete) {
    return {
      levelId,
      isAccessible: false,
      isCompleted: false,
      quizzesCompleted: progress?.quizzesCompleted || 0,
      lockedReason: `Complete Level ${previousLevelId} to unlock this level`,
    };
  }

  return {
    levelId,
    isAccessible: true,
    isCompleted: progress?.completed || false,
    quizzesCompleted: progress?.quizzesCompleted || 0,
  };
}

/**
 * Check if a specific quiz is accessible to a user
 *
 * Rules:
 * - Quizzes 1 & 2 are always accessible if the level is accessible
 * - Quiz 3 (boss quiz) requires quizzes 1 & 2 to be completed first
 *
 * @param levelId - The level containing the quiz
 * @param quizNumber - The quiz number (1, 2, or 3)
 * @param progressMap - Map of level progress by levelId
 * @returns Object with accessibility status and reason
 */
export function isQuizAccessible(
  levelId: number,
  quizNumber: number,
  progressMap: Map<number, { completed: boolean; quizzesCompleted: number }>
): QuizAccessibility {
  // First check if the level itself is accessible
  const levelAccessibility = isLevelAccessible(levelId, progressMap);

  if (!levelAccessibility.isAccessible) {
    return {
      isAccessible: false,
      lockedReason: levelAccessibility.lockedReason,
    };
  }

  // Quizzes 1 & 2 are always accessible if level is accessible
  if (quizNumber === 1 || quizNumber === 2) {
    return { isAccessible: true };
  }

  // Quiz 3 (boss quiz) requires quizzes 1 & 2 to be completed
  if (quizNumber === 3) {
    const progress = progressMap.get(levelId);
    const quizzesCompleted = progress?.quizzesCompleted || 0;

    if (quizzesCompleted < 2) {
      return {
        isAccessible: false,
        lockedReason: "Complete quizzes 1 and 2 to unlock the challenge quiz",
      };
    }

    return { isAccessible: true };
  }

  return { isAccessible: false, lockedReason: "Invalid quiz number" };
}

/**
 * Get user's apprenticeship progress for all levels
 *
 * @param userId - The user's ID
 * @param industryId - Optional industry ID to filter progress
 * @returns Map of level progress by levelId
 */
export async function getUserLevelProgress(
  userId: string,
  industryId: number | null = null
): Promise<Map<number, { completed: boolean; quizzesCompleted: number }>> {
  // Normalize industryId: convert undefined to null for consistent matching
  const normalizedIndustryId = industryId === undefined ? null : industryId;

  const userProgress = await prisma.userApprenticeshipProgress.findMany({
    where: {
      userId,
      industryId: normalizedIndustryId,
    },
    select: {
      levelId: true,
      isLevelComplete: true,
      quizzesCompleted: true,
      industryId: true,
    },
  });

  console.log(`📊 Found ${userProgress.length} progress records for user ${userId} with industryId ${normalizedIndustryId}:`, JSON.stringify(userProgress, null, 2));

  return new Map(
    userProgress.map((p) => [
      p.levelId,
      { completed: p.isLevelComplete, quizzesCompleted: p.quizzesCompleted },
    ])
  );
}

/**
 * Get accessibility status for all levels for a user
 *
 * @param userId - The user's ID
 * @param industryId - Optional industry ID to filter progress
 * @param levelIds - Array of level IDs to check
 * @returns Array of level accessibility objects
 */
export async function getAllLevelsAccessibility(
  userId: string,
  industryId: number | null = null,
  levelIds: number[] = [1, 2, 3]
): Promise<LevelAccessibility[]> {
  const progressMap = await getUserLevelProgress(userId, industryId);

  return levelIds.map((levelId) => isLevelAccessible(levelId, progressMap));
}
