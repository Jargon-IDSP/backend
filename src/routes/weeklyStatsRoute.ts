import { Hono } from 'hono';
import {
  getCurrentWeeklyStats,
  getLeaderboard,
  getWeeklyHistory,
  getStatistics,
  getFriendsWeeklyStats
} from '../controllers/weeklyTrackingController';

const weeklyStatsRoute = new Hono();

weeklyStatsRoute.get('/current', getCurrentWeeklyStats);

weeklyStatsRoute.get('/leaderboard', getLeaderboard);

weeklyStatsRoute.get('/history', getWeeklyHistory);

weeklyStatsRoute.get('/statistics', getStatistics);

weeklyStatsRoute.get('/friends', getFriendsWeeklyStats);

export default weeklyStatsRoute;