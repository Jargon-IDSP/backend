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
        email: true,
        createdAt: true,
        avatar: {
          select: {
            body: true,
            bodyColor: true,
            expression: true,
            hair: true,
            headwear: true,
            eyewear: true,
            facial: true,
            clothing: true,
            shoes: true,
            accessories: true,
          },
        },
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

    // Get users I'm following
    const myFollowing = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: 'FOLLOWING',
      },
      select: { followingId: true },
    });

    const followingIds = myFollowing.map((f) => f.followingId);

    // Get which of those users are also following me back (mutual = friends)
    const mutualFollows = await prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: userId,
        status: 'FOLLOWING',
      },
      select: { followerId: true },
    });

    const friendIds = mutualFollows.map((f) => f.followerId);

    // Get friend users' data
    const friends = await prisma.user.findMany({
      where: {
        id: { in: friendIds },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        score: true,
        language: true,
        email: true,
        createdAt: true,
        avatar: {
          select: {
            body: true,
            bodyColor: true,
            expression: true,
            hair: true,
            headwear: true,
            eyewear: true,
            facial: true,
            clothing: true,
            shoes: true,
            accessories: true,
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
        email: true,
        createdAt: true,
        avatar: {
          select: {
            body: true,
            bodyColor: true,
            expression: true,
            hair: true,
            headwear: true,
            eyewear: true,
            facial: true,
            clothing: true,
            shoes: true,
            accessories: true,
          },
        },
      },
    });

    // Combine friends with current user
    const allUsers = currentUser ? [currentUser, ...friends] : friends;

    // Sort by score descending
    allUsers.sort((a, b) => b.score - a.score);

    return c.json({
      success: true,
      data: allUsers,
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
