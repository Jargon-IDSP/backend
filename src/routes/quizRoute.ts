import { Hono } from 'hono';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  startAttempt,
  submitAnswer,
  getCurrentAttempt,
  getStats,
  getAllAttempts,
  getInProgressAttempts,
  retryAttempt,
  getAttemptHistory,
  getQuiz,
  translateQuiz,
  getQuestion,
  translateQuestion,
} from '../controllers/quizController';

const quizRoute = new Hono();

// Apply auth middleware to all routes
quizRoute.use('*', authMiddleware);

// Quiz attempt routes
quizRoute.post('/start', startAttempt);
quizRoute.post('/:attemptId/answer', submitAnswer);
quizRoute.get('/:customQuizId/current', getCurrentAttempt);
quizRoute.post('/:customQuizId/retry', retryAttempt);
quizRoute.get('/:customQuizId/history', getAttemptHistory);

// Quiz content routes
quizRoute.get('/:customQuizId/quiz', getQuiz);
quizRoute.get('/:customQuizId/quiz/translate', translateQuiz);

// Question routes
quizRoute.get('/questions/:questionId', getQuestion);
quizRoute.get('/questions/:questionId/translate', translateQuestion);

// Stats routes
quizRoute.get('/stats', getStats);
quizRoute.get('/:customQuizId/all', getAllAttempts);
quizRoute.get('/in-progress', getInProgressAttempts);

export default quizRoute;