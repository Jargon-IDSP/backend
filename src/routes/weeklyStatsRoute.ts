import { Hono } from 'hono';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getCurrentWeeklyStats,
  getRollingWeek,
  getLeaderboard,
  getWeeklyHistory,
  getStatistics,
  getFriendsWeeklyStats,
  getSelfLeaderboard,
  getMonthlyActivity
} from '../controllers/weeklyTrackingController';

const weeklyStatsRoute = new Hono();

weeklyStatsRoute.use('*', authMiddleware);

weeklyStatsRoute.get('/current', getCurrentWeeklyStats);

weeklyStatsRoute.get('/rolling-week', getRollingWeek);

weeklyStatsRoute.get('/leaderboard', getLeaderboard);

weeklyStatsRoute.get('/history', getWeeklyHistory);

weeklyStatsRoute.get('/statistics', getStatistics);

weeklyStatsRoute.get('/friends', getFriendsWeeklyStats);

weeklyStatsRoute.get('/self', getSelfLeaderboard);

weeklyStatsRoute.get('/monthly-activity', getMonthlyActivity);

export default weeklyStatsRoute;