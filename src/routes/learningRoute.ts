import { Hono } from "hono";
const prismaModule = await import('@prisma/client') as any;
const { PrismaClient } = prismaModule;
import { authMiddleware } from "../middleware/authMiddleware";

import {
  getFlashcards,
  getRandomFlashcard,
  getFlashcardsByLevel,
  getPracticeTermsByLevel,
  getLevels,
  getCustomFlashcardsByDocument,
  getCustomFlashcardsByUser,
  getRandomCustomFlashcard,
} from "../controllers/flashcardController";

import {
  getQuestionsByLevel,
  getRandomQuestion,
  getCustomQuestionsByDocument,
  getCustomQuestionsByUser,
  getRandomCustomQuestion,
  getQuizzesByLevel,
  getCustomQuizzesByDocument,
  getCustomQuizzesByUser,
  generateQuizForLevel,
  generateCustomQuiz,
} from "../controllers/questionController";

import { prisma } from '../lib/prisma';

export const learningRoute = new Hono()
  .use("*", authMiddleware)

  .get("/existing/levels/:levelId/terms", getPracticeTermsByLevel)
  .get("/existing/random/flashcard", getRandomFlashcard)
  
  .get("/custom/documents/:documentId/terms", getCustomFlashcardsByDocument)
  .get("/custom/terms", getCustomFlashcardsByUser)
  .get("/custom/random/flashcard", getRandomCustomFlashcard)

  .get("/existing/levels/:levelId/questions", getQuestionsByLevel)
  .get("/existing/random/question", getRandomQuestion)
  
  .get("/custom/documents/:documentId/questions", getCustomQuestionsByDocument)
  .get("/custom/questions", getCustomQuestionsByUser)
  .get("/custom/random/question", getRandomCustomQuestion)

  .get("/existing/levels/:levelId/quiz/generate", generateQuizForLevel)
  .get("/custom/quiz/generate", generateCustomQuiz)

  .get("/existing/levels/:levelId/quizzes", getQuizzesByLevel)
  .get("/custom/documents/:documentId/quizzes", getCustomQuizzesByDocument)
  .get("/custom/quizzes", getCustomQuizzesByUser)

  .get("/:type/levels", getLevels)
  .get("/:type/levels/:levelId", getLevels);