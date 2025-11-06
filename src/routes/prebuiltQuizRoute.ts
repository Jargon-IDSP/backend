import { Hono } from 'hono';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  getPrebuiltQuizzesForLevel,
  startPrebuiltAttempt,
  recordPrebuiltAnswer,
  getApprenticeshipProgress,
  getBadges,
  getPrebuiltQuizAttempt,
  getPrebuiltQuizQuestions,
  getAvailableBadges,
} from '../controllers/prebuiltQuizController';

const prebuiltQuizRoute = new Hono();

// Apply auth middleware to all routes
prebuiltQuizRoute.use('*', authMiddleware);

// Get quizzes for a level and industry
prebuiltQuizRoute.get('/levels/:levelId', getPrebuiltQuizzesForLevel);
prebuiltQuizRoute.get('/levels/:levelId/industry/:industryId', getPrebuiltQuizzesForLevel);

// Start a prebuilt quiz attempt
prebuiltQuizRoute.post('/:prebuiltQuizId/start', startPrebuiltAttempt);

// Submit an answer for a prebuilt quiz attempt
prebuiltQuizRoute.post('/attempts/:attemptId/answer', recordPrebuiltAnswer);

// Get user's latest attempt for a specific prebuilt quiz
prebuiltQuizRoute.get('/:prebuiltQuizId/attempt', getPrebuiltQuizAttempt);

// Get questions for a prebuilt quiz
prebuiltQuizRoute.get('/:prebuiltQuizId/questions', getPrebuiltQuizQuestions);

// Get user's apprenticeship progress
prebuiltQuizRoute.get('/progress', getApprenticeshipProgress);

// Get user's earned badges
prebuiltQuizRoute.get('/badges', getBadges);

// Get all available badges
prebuiltQuizRoute.get('/available-badges', getAvailableBadges);

export default prebuiltQuizRoute;
