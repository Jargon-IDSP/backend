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
  getCustomQuizCountByUser,
  getUserLessonNames,
  getLessonDetails,
  getDocumentsByCategory,
  getCustomQuizById,
  getCustomQuizByDocument, // Added this new function
  generateQuizForLevel,
  generateCustomQuiz,
  completeQuiz,
  getAllCategories,
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
  shareQuizWithFriend,
  unshareQuiz,
  getQuizShares,
  getSharedWithMe,
  getMySharedQuizzes,
  shareWithMultipleFriends,
} from "../controllers/quizShareController";

export const learningRoute = new Hono();

learningRoute.use("*", authMiddleware);

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

const customRoutes = new Hono()
  .get("/overview", getCustomFlashcardsByUser)
  .get("/shared", getSharedWithMe)

  .get("/categories", getAllCategories)
  .get("/categories/:category/terms", getCustomFlashcardsByCategory)
  .get("/categories/:category/questions", getCustomQuestionsByCategory)
  .get("/categories/:category/quizzes", getCustomQuizzesByCategory)
  .get("/quizzes/by-category/:category", getDocumentsByCategory)

  .get("/terms", getCustomFlashcardsByUser)
  .get("/questions", getCustomQuestionsByUser)
  .get("/quizzes", getCustomQuizzesByUser)
  .get("/users/:userId/quizzes/count", getCustomQuizCountByUser)
  .get("/users/:userId/lessons", getUserLessonNames)
  .get("/users/:userId/lessons/:lessonId", getLessonDetails)

  .get("/random/flashcard", getRandomCustomFlashcard)
  .get("/random/question", getRandomCustomQuestion)

  .get("/quiz/generate", generateCustomQuiz);

const documentLearningRoutes = new Hono()
  .get("/:documentId/overview", getCustomQuizByDocument) // Changed from getCustomQuizById
  .get("/:documentId/terms", getCustomFlashcardsByDocument)
  .get("/:documentId/questions", getCustomQuestionsByDocument)
  .get("/:documentId/quizzes", getCustomQuizzesByDocument);

const quizAttemptRoutes = new Hono()
  .get("/:customQuizId", getQuiz)
  .get("/:customQuizId/translate", translateQuiz)
  .get("/questions/:questionId", getQuestion)
  .get("/questions/:questionId/translate", translateQuestion)

  .post("/start", startAttempt)
  .post("/:attemptId/answer", submitAnswer)
  .post("/:customQuizId/retry", retryAttempt)
  .post("/complete", completeQuiz) // Legacy

  .get("/:customQuizId/current", getCurrentAttempt)
  .get("/:customQuizId/history", getAttemptHistory)
  .get("/:customQuizId/attempts", getAllAttempts)
  .get("/in-progress", getInProgressAttempts)

  .get("/stats/user", getStats);

const sharingRoutes = new Hono()
  .post("/share", shareQuizWithFriend)
  .post("/share-multiple", shareWithMultipleFriends)
  .delete("/:shareId", unshareQuiz)

  .get("/quiz/:quizId/shares", getQuizShares)
  .get("/shared-with-me", getSharedWithMe)
  .get("/my-shared", getMySharedQuizzes);

learningRoute.route("/existing", existingRoutes);
learningRoute.route("/custom", customRoutes);
learningRoute.route("/documents", documentLearningRoutes);
learningRoute.route("/attempts", quizAttemptRoutes);
learningRoute.route("/sharing", sharingRoutes);

export default learningRoute;
