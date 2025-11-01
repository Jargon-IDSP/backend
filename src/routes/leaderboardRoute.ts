import { Hono } from 'hono';
import { authMiddleware } from '../middleware/authMiddleware';
import { getLeaderboard, getFriendsLeaderboard } from '../controllers/leaderboardController';

export const leaderboardRoute = new Hono()
  .get('/', getLeaderboard)
  .use('/friends', authMiddleware)
  .get('/friends', getFriendsLeaderboard);
