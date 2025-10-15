import { Hono } from 'hono';
import { getLeaderboard } from '../controllers/leaderboardController';

export const leaderboardRoute = new Hono()
  .get('/', getLeaderboard);
