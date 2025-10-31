import { prisma } from "../lib/prisma";
import type { UserWeeklyStats } from "../interfaces/weeklyData";

// Get current date in PST timezone
export function getPSTDate(): Date {
  const now = new Date();
  // Convert to PST timezone string, then create a new Date
  const pstString = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  return new Date(pstString);
}

export function getCurrentWeekStart(): Date {
  const now = getPSTDate();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);

  return monday;
}

export function getDayAbbreviation(date?: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const targetDate = date || getPSTDate();
  const day = days[targetDate.getDay()];
  return day ?? 'Sun';
}

export async function getCurrentWeekStats(userId: string): Promise<UserWeeklyStats> {
  const weekStart = getCurrentWeekStart();
  
  let stats = await prisma.userWeeklyStats.findUnique({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: weekStart,
      },
    },
  });

  if (!stats) {
    stats = await prisma.userWeeklyStats.create({
      data: {
        userId,
        weekStartDate: weekStart,
        weeklyScore: 0,
        daysActive: "",
      },
    });
  }

  return stats;
}

export async function addWeeklyScore(userId: string, points: number): Promise<UserWeeklyStats> {
  const weekStart = getCurrentWeekStart();
  
  const stats = await prisma.userWeeklyStats.upsert({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: weekStart,
      },
    },
    update: {
      weeklyScore: {
        increment: points,
      },
    },
    create: {
      userId,
      weekStartDate: weekStart,
      weeklyScore: points,
      daysActive: "",
    },
  });

  return stats;
}

export async function markDayActive(userId: string): Promise<string[]> {
  const weekStart = getCurrentWeekStart();
  const today = getDayAbbreviation();
  
  const stats = await getCurrentWeekStats(userId);
  
  const activeDays = stats.daysActive ? stats.daysActive.split(',').filter(d => d) : [];
  
  if (!activeDays.includes(today)) {
    activeDays.push(today);
    
    await prisma.userWeeklyStats.update({
      where: { id: stats.id },
      data: {
        daysActive: activeDays.join(','),
      },
    });
  }
  
  return activeDays;
}

export async function getWeeklyLeaderboard(limit: number = 10) {
  const weekStart = getCurrentWeekStart();
  
  const leaderboard = await prisma.userWeeklyStats.findMany({
    where: {
      weekStartDate: weekStart,
      weeklyScore: {
        gt: 0,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: [
      { weeklyScore: 'desc' },
      { updatedAt: 'asc' },
    ],
    take: limit,
  });

  return leaderboard.map((entry, index) => ({
    rank: index + 1,
    userId: entry.user.id,
    username: entry.user.username || `${entry.user.firstName} ${entry.user.lastName}`,
    email: entry.user.email,
    weeklyScore: entry.weeklyScore,
    daysActive: entry.daysActive ? entry.daysActive.split(',').filter(d => d) : [],
    daysActiveCount: entry.daysActive ? entry.daysActive.split(',').filter(d => d).length : 0,
  }));
}

export async function getUserWeeklyRank(userId: string): Promise<number | null> {
  const weekStart = getCurrentWeekStart();
  
  const userStats = await prisma.userWeeklyStats.findUnique({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: weekStart,
      },
    },
  });

  if (!userStats) return null;

  const usersAbove = await prisma.userWeeklyStats.count({
    where: {
      weekStartDate: weekStart,
      OR: [
        { weeklyScore: { gt: userStats.weeklyScore } },
        {
          weeklyScore: userStats.weeklyScore,
          updatedAt: { lt: userStats.updatedAt },
        },
      ],
    },
  });

  return usersAbove + 1;
}

export async function getWeeklyStatsForUsers(userIds: string[]) {
  const weekStart = getCurrentWeekStart();
  
  return await prisma.userWeeklyStats.findMany({
    where: {
      userId: { in: userIds },
      weekStartDate: weekStart,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

export async function getUserWeeklyHistory(userId: string, weeksBack: number = 4): Promise<UserWeeklyStats[]> {
  const currentWeekStart = getCurrentWeekStart();
  const startDate = new Date(currentWeekStart);
  startDate.setDate(startDate.getDate() - (weeksBack * 7));
  
  return await prisma.userWeeklyStats.findMany({
    where: {
      userId,
      weekStartDate: {
        gte: startDate,
      },
    },
    orderBy: {
      weekStartDate: 'desc',
    },
  });
}

export async function getWeeklyStatistics() {
  const weekStart = getCurrentWeekStart();
  
  const stats = await prisma.userWeeklyStats.findMany({
    where: {
      weekStartDate: weekStart,
    },
  });

  const totalUsers = stats.length;
  const activeUsers = stats.filter(s => s.daysActive && s.daysActive.length > 0).length;
  const totalScore = stats.reduce((sum, s) => sum + s.weeklyScore, 0);
  const averageScore = totalUsers > 0 ? Math.round(totalScore / totalUsers) : 0;
  
  const daysActiveDistribution: Record<number, number> = {
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0
  };
  
  stats.forEach(s => {
    const count = s.daysActive ? s.daysActive.split(',').filter((d: string) => d).length : 0;
    if (daysActiveDistribution[count] !== undefined) {
      daysActiveDistribution[count]++;
    }
  });

  return {
    weekStart,
    totalUsers,
    activeUsers,
    totalScore,
    averageScore,
    daysActiveDistribution,
  };
}

export async function trackUserActivity(userId: string): Promise<void> {
  try {
    await markDayActive(userId);
  } catch (error) {
    console.error('Failed to track user activity:', error);
  }
}

// Route Handlers (Context-based)
import type { Context } from 'hono';

export async function getCurrentWeeklyStats(c: Context) {
  try {
    const userId = c.get('user')?.id;
    
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Mark today as active when user checks their stats
    await markDayActive(userId);

    const stats = await getCurrentWeekStats(userId);
    const rank = await getUserWeeklyRank(userId);
    const activeDays = stats.daysActive ? stats.daysActive.split(',').filter((d: string) => d) : [];

    console.log('Weekly stats for user:', userId);
    console.log('Days active string:', stats.daysActive);
    console.log('Days active array:', activeDays);

    return c.json({
      success: true,
      data: {
        weeklyScore: stats.weeklyScore,
        daysActive: activeDays,
        daysActiveCount: activeDays.length,
        rank,
        weekStartDate: stats.weekStartDate,
      },
    });
  } catch (error) {
    console.error('Error fetching weekly stats:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch weekly stats',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

export async function getLeaderboard(c: Context) {
  try {
    const limit = parseInt(c.req.query('limit') || '10');
    const leaderboard = await getWeeklyLeaderboard(limit);

    return c.json({
      success: true,
      data: leaderboard,
    });
  } catch (error) {
    console.error('Error fetching weekly leaderboard:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch weekly leaderboard',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

export async function getWeeklyHistory(c: Context) {
  try {
    const userId = c.get('userId');
    
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const weeksBack = parseInt(c.req.query('weeks') || '4');
    const history = await getUserWeeklyHistory(userId, weeksBack);

    return c.json({
      success: true,
      data: history.map(h => ({
        weekStartDate: h.weekStartDate,
        weeklyScore: h.weeklyScore,
        daysActive: h.daysActive ? h.daysActive.split(',').filter((d: string) => d) : [],
        daysActiveCount: h.daysActive ? h.daysActive.split(',').filter((d: string) => d).length : 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching weekly history:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch weekly history',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

export async function getStatistics(c: Context) {
  try {
    const statistics = await getWeeklyStatistics();

    return c.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    console.error('Error fetching weekly statistics:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch weekly statistics',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

export async function getFriendsWeeklyStats(c: Context) {
  try {
    const userId = c.get('userId');
    
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
      select: {
        requesterId: true,
        addresseeId: true,
      },
    });

    const friendIds = friendships.map(f => 
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );

    const userIds = [userId, ...friendIds];
    const stats = await getWeeklyStatsForUsers(userIds);

    return c.json({
      success: true,
      data: stats.map(s => ({
        userId: s.userId,
        username: s.user.username || `${s.user.firstName} ${s.user.lastName}`,
        weeklyScore: s.weeklyScore,
        daysActive: s.daysActive ? s.daysActive.split(',').filter((d: string) => d) : [],
        daysActiveCount: s.daysActive ? s.daysActive.split(',').filter((d: string) => d).length : 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching friends weekly stats:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch friends weekly stats',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}