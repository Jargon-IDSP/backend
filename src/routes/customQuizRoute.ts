import { Hono } from "hono";
import customQuiz from "../controllers/customQuizController";
import { authMiddleware } from "../middleware/authMiddleware";

export const customQuizRoute = new Hono()
  .use("*", authMiddleware)
  .get("/custom/quiz", customQuiz);
