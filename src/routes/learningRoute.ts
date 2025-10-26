import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";

import {
  getFlashcards,
  getRandomFlashcard,
  getFlashcardsByLevel,
  getPracticeTermsByLevel,
  getLevels,
  getCustomFlashcardsByDocument,
  getCustomFlashcardsByUser,
  getCustomFlashcardsByCategory,
  getRandomCustomFlashcard,
} from "../controllers/flashcardController";

import {
  getQuestionsByLevel,
  getRandomQuestion,
  getCustomQuestionsByDocument,
  getCustomQuestionsByUser,
  getCustomQuestionsByCategory,
  getRandomCustomQuestion,
  getQuizzesByLevel,
  getCustomQuizzesByDocument,
  getCustomQuizzesByUser,
  getCustomQuizzesByCategory,
  getCustomQuizById,
  generateQuizForLevel,
  generateCustomQuiz,
  completeQuiz,
} from "../controllers/questionController";

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
} from "../controllers/quizController";

import {
  shareQuiz,
  unshareQuiz,
  getQuizShares,
  getSharedWithMe,
  getMySharedQuizzes,
  shareWithMultiple,
} from "../controllers/quizShareController";

export const learningRoute = new Hono();

learningRoute.use("*", authMiddleware);

// ============================================================
// EXISTING CONTENT ROUTES (Platform flashcards by level)
// ============================================================
const existingRoutes = new Hono()
  .get("/levels", getLevels)
  .get("/levels/:levelId", getLevels)
  
  .get("/levels/:levelId/terms", getPracticeTermsByLevel)
  .get("/levels/:levelId/questions", getQuestionsByLevel)
  .get("/levels/:levelId/quizzes", getQuizzesByLevel)
  .get("/levels/:levelId/quiz/generate", generateQuizForLevel)
  
  // Legacy endpoints
  .get("/random/flashcard", getRandomFlashcard) 
  .get("/random/question", getRandomQuestion);

// ============================================================
// CUSTOM CONTENT ROUTES (User-generated from documents)
// ============================================================
const customRoutes = new Hono()
  // Overview pages
  .get("/overview", getCustomFlashcardsByUser) // All user content overview
  .get("/shared", getSharedWithMe)             // Content shared with me
  
  // Filter by category
  .get("/categories/:category/terms", getCustomFlashcardsByCategory)
  .get("/categories/:category/questions", getCustomQuestionsByCategory)
  .get("/categories/:category/quizzes", getCustomQuizzesByCategory)
  
  // All content by type (across all documents)
  .get("/terms", getCustomFlashcardsByUser)
  .get("/questions", getCustomQuestionsByUser)
  .get("/quizzes", getCustomQuizzesByUser)
  
  // Random selection
  .get("/random/flashcard", getRandomCustomFlashcard)
  .get("/random/question", getRandomCustomQuestion)
  
  // Quiz generation
  .get("/quiz/generate", generateCustomQuiz);

// ============================================================
// DOCUMENT-SPECIFIC LEARNING ROUTES
// ============================================================
// Note: These are separate from /documents routes because they're
// specifically about learning activities, not document management
const documentLearningRoutes = new Hono()
  .get("/:documentId/overview", getCustomQuizById)     // Document learning overview
  .get("/:documentId/terms", getCustomFlashcardsByDocument)
  .get("/:documentId/questions", getCustomQuestionsByDocument)
  .get("/:documentId/quizzes", getCustomQuizzesByDocument);

// ============================================================
// QUIZ ATTEMPT ROUTES (Works for both existing and custom)
// ============================================================
const quizAttemptRoutes = new Hono()
  // Get quiz data with language support
  .get("/:customQuizId", getQuiz)
  .get("/:customQuizId/translate", translateQuiz)
  .get("/questions/:questionId", getQuestion)
  .get("/questions/:questionId/translate", translateQuestion)
  
  // Manage attempts
  .post("/start", startAttempt)
  .post("/:attemptId/answer", submitAnswer)
  .post("/:customQuizId/retry", retryAttempt)
  .post("/complete", completeQuiz)  // Legacy - consider deprecating
  
  // Get attempt data
  .get("/:customQuizId/current", getCurrentAttempt)
  .get("/:customQuizId/history", getAttemptHistory)
  .get("/:customQuizId/attempts", getAllAttempts)
  .get("/in-progress", getInProgressAttempts)
  
  // Statistics
  .get("/stats/user", getStats);

// ============================================================
// SHARING ROUTES (Custom content only)
// ============================================================
const sharingRoutes = new Hono()
  // Share management
  .post("/share", shareQuiz)
  .post("/share-multiple", shareWithMultiple)
  .delete("/:shareId", unshareQuiz)
  
  // View shares
  .get("/quiz/:quizId/shares", getQuizShares)
  .get("/shared-with-me", getSharedWithMe)
  .get("/my-shared", getMySharedQuizzes);

// ============================================================
// MOUNT ROUTES
// ============================================================
learningRoute.route("/existing", existingRoutes);
learningRoute.route("/custom", customRoutes);
learningRoute.route("/documents", documentLearningRoutes);  // Document-specific learning
learningRoute.route("/attempts", quizAttemptRoutes);
learningRoute.route("/sharing", sharingRoutes);

export default learningRoute;