import type { Context } from 'hono';
import { prisma } from '../lib/prisma';

export const getLeaderboard = async (c: Context) => {
  try {
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

export const getFriendsLeaderboard = async (c: Context) => {
  try {
    const user = c.get('user');
    const userId = user.id;

    // Get all accepted friendships for the user
    const friendships = await prisma.friendship.findMany({
      where: {
        AND: [
          {
            OR: [
              { requesterId: userId },
              { addresseeId: userId },
            ],
          },
          { status: 'ACCEPTED' },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            score: true,
            language: true,
          },
        },
        addressee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            score: true,
            language: true,
          },
        },
      },
    });

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        score: true,
        language: true,
      },
    });

    // Extract friends from friendships
    const friends = friendships.map((friendship) => {
      return friendship.requesterId === userId
        ? friendship.addressee
        : friendship.requester;
    });

    // Combine friends with current user
    const allUsers = currentUser ? [currentUser, ...friends] : friends;

    // Remove duplicates (in case user is somehow a friend of themselves)
    const uniqueUsers = Array.from(
      new Map(allUsers.map(user => [user.id, user])).values()
    );

    // Sort by score descending
    uniqueUsers.sort((a, b) => b.score - a.score);

    return c.json({
      success: true,
      data: uniqueUsers,
    });
  } catch (error) {
    console.error('Error fetching friends leaderboard:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch friends leaderboard',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
};