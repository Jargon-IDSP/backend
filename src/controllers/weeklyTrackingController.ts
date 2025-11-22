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

export async function getRollingWeekActivity(userId: string): Promise<string[]> {
  const today = getPSTDate();
  const daysArray = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Calculate the date range (3 days back to 3 days forward)
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 3);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 3);
  endDate.setHours(23, 59, 59, 999);

  // Determine which weeks we need to query
  const currentWeekStart = getCurrentWeekStart();
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  // Query both current and previous week stats
  const weekStats = await prisma.userWeeklyStats.findMany({
    where: {
      userId,
      weekStartDate: {
        in: [previousWeekStart, currentWeekStart]
      }
    }
  });

  // Combine active days from both weeks
  const allActiveDays = new Set<string>();
  weekStats.forEach(stat => {
    if (stat.daysActive) {
      const days = stat.daysActive.split(',').filter(d => d);
      days.forEach(day => allActiveDays.add(day));
    }
  });

  // Build the rolling 7-day window and filter by active days
  const rollingActiveDays: string[] = [];
  for (let i = -3; i <= 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const dayAbbr = getDayAbbreviation(date);

    // Only include days that are in the past or today (not future)
    if (i <= 0 && allActiveDays.has(dayAbbr)) {
      rollingActiveDays.push(dayAbbr);
    }
  }

  return rollingActiveDays;
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

export async function getMonthlyActivity(c: Context) {
  try {
    const user = c.get("user");
    const userId = user?.id;

    if (!userId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    // Get current date in PST
    const now = getPSTDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate start date (5 months ago, first day of that month)
    const startDate = new Date(currentYear, currentMonth - 4, 1);
    startDate.setHours(0, 0, 0, 0);

    // Get all weekly stats for the past 5 months
    const weeklyStats = await prisma.userWeeklyStats.findMany({
      where: {
        userId,
        weekStartDate: {
          gte: startDate,
        },
      },
      orderBy: {
        weekStartDate: 'asc',
      },
    });

    // Group stats by month and count active days
    const monthlyData: Array<{ month: string; year: number; daysActive: number; maxDays: number }> = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Initialize months (5 months: 4 past + current)
    for (let i = -4; i <= 0; i++) {
      const monthDate = new Date(currentYear, currentMonth + i, 1);
      const month = monthDate.getMonth();
      const year = monthDate.getFullYear();
      const monthKey = `${year}-${month}`;

      // Count days in this month
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // Filter weekly stats for this month
      const monthStats = weeklyStats.filter(stat => {
        const statDate = new Date(stat.weekStartDate);
        return statDate.getMonth() === month && statDate.getFullYear() === year;
      });

      // Count total active days across all weeks in this month
      let totalActiveDays = 0;
      monthStats.forEach(stat => {
        if (stat.daysActive) {
          const days = stat.daysActive.split(',').filter(d => d.trim());
          totalActiveDays += days.length;
        }
      });

      monthlyData.push({
        month: monthNames[month],
        year,
        daysActive: totalActiveDays,
        maxDays: daysInMonth,
      });
    }

    return c.json({
      success: true,
      data: monthlyData,
    });
  } catch (error) {
    console.error("Error fetching monthly activity:", error);
    return c.json({ success: false, error: "Failed to fetch monthly activity" }, 500);
  }
}

export async function getRollingWeek(c: Context) {
  try {
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Mark today as active when user checks their stats
    await markDayActive(userId);

    const activeDays = await getRollingWeekActivity(userId);

    return c.json({
      success: true,
      data: {
        daysActive: activeDays,
        daysActiveCount: activeDays.length,
      },
    });
  } catch (error) {
    console.error('Error fetching rolling week stats:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch rolling week stats',
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

// Get user's rank for a specific week
export async function getUserRankForWeek(userId: string, weekStartDate: Date): Promise<number | null> {
  const userStats = await prisma.userWeeklyStats.findUnique({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate,
      },
    },
  });

  if (!userStats || userStats.weeklyScore === 0) return null;

  const usersAbove = await prisma.userWeeklyStats.count({
    where: {
      weekStartDate,
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

// Get user's medal counts and weekly placements
export async function getUserMedalsAndPlacements(userId: string, weeksBack: number = 12) {
  const currentWeekStart = getCurrentWeekStart();
  const startDate = new Date(currentWeekStart);
  startDate.setDate(startDate.getDate() - (weeksBack * 7));
  
  // Get all weekly stats for the user
  const userStats = await prisma.userWeeklyStats.findMany({
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

  // If user has no stats, return empty results
  if (userStats.length === 0) {
    return {
      medals: {
        gold: 0,
        silver: 0,
        bronze: 0,
      },
      placements: [],
    };
  }

  // Get all weekly stats for all users in the same weeks to calculate ranks
  const weekStartDates = userStats.map(s => s.weekStartDate);
  
  const allWeeklyStats = await prisma.userWeeklyStats.findMany({
    where: {
      weekStartDate: {
        in: weekStartDates,
      },
      weeklyScore: {
        gt: 0,
      },
    },
    orderBy: [
      { weekStartDate: 'desc' },
      { weeklyScore: 'desc' },
      { updatedAt: 'asc' },
    ],
  });

  // Group stats by week and calculate ranks
  const weeklyRanks = new Map<string, number | null>();
  const weekGroups = new Map<string, typeof allWeeklyStats>();
  
  for (const stat of allWeeklyStats) {
    const weekKey = stat.weekStartDate.toISOString();
    if (!weekGroups.has(weekKey)) {
      weekGroups.set(weekKey, []);
    }
    weekGroups.get(weekKey)!.push(stat);
  }

  // Calculate ranks for each week
  // Stats are already sorted by weeklyScore desc, updatedAt asc
  for (const [weekKey, stats] of weekGroups.entries()) {
    // Find user's index in the sorted list
    const userIndex = stats.findIndex(s => s.userId === userId);
    
    if (userIndex === -1) {
      // User not found in this week (didn't participate or had 0 score)
      weeklyRanks.set(weekKey, null);
    } else {
      // Rank is simply index + 1 (since list is sorted by score descending)
      // Ties are already handled by updatedAt sorting
      weeklyRanks.set(weekKey, userIndex + 1);
    }
  }

  // Count medals
  let goldCount = 0;
  let silverCount = 0;
  let bronzeCount = 0;

  // Get placements for each week
  const placements = userStats.map(stat => {
    const weekKey = stat.weekStartDate.toISOString();
    const rank = weeklyRanks.get(weekKey) || null;
    
    if (rank === 1) goldCount++;
    else if (rank === 2) silverCount++;
    else if (rank === 3) bronzeCount++;

    // Calculate week end date (Sunday) - create a new date to avoid mutation
    const weekStart = new Date(stat.weekStartDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    return {
      weekStartDate: stat.weekStartDate.toISOString(),
      weekEndDate: weekEnd.toISOString(),
      rank,
      weeklyScore: stat.weeklyScore,
    };
  });

  return {
    medals: {
      gold: goldCount,
      silver: silverCount,
      bronze: bronzeCount,
    },
    placements,
  };
}

export async function getSelfLeaderboard(c: Context) {
  try {
    const userId = c.get('user')?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const weeksBack = parseInt(c.req.query('weeks') || '12');

    console.log(`Fetching self leaderboard for user ${userId}, weeks back: ${weeksBack}`);

    const data = await getUserMedalsAndPlacements(userId, weeksBack);

    console.log(`Self leaderboard data:`, {
      medals: data.medals,
      placementsCount: data.placements.length
    });

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching self leaderboard:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    return c.json({
      success: false,
      message: 'Failed to fetch self leaderboard',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

export async function getUserLeaderboardForUser(c: Context) {
  try {
    const targetUserId = c.req.param('userId');
    const requestingUserId = c.get('user')?.id;

    if (!requestingUserId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!targetUserId) {
      return c.json({ error: 'User ID required' }, 400);
    }

    const weeksBack = parseInt(c.req.query('weeks') || '12');

    console.log(`Fetching leaderboard for user ${targetUserId}, requested by ${requestingUserId}, weeks back: ${weeksBack}`);

    const data = await getUserMedalsAndPlacements(targetUserId, weeksBack);

    console.log(`User leaderboard data for ${targetUserId}:`, {
      medals: data.medals,
      placementsCount: data.placements.length
    });

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching user leaderboard:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    return c.json({
      success: false,
      message: 'Failed to fetch user leaderboard',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}