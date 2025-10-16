import type { Context } from 'hono';
import { prisma } from '../lib/prisma';

export const getLeaderboard = async (c: Context) => {
  try {
    // Get all users ordered by score (highest first)
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        score: true,
        language: true,
      },
      orderBy: {
        score: 'desc',
      },
    });

    return c.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch leaderboard',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
};
