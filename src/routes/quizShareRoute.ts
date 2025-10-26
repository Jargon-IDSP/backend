import { Hono } from "hono";
import {
  shareQuiz,
  unshareQuiz,
  getQuizShares,
  getSharedWithMe,
  getMySharedQuizzes,
  shareWithMultiple,
} from "../controllers/quizShareController";
import { authMiddleware } from "../middleware/authMiddleware";

const quizShareRoute = new Hono();

quizShareRoute.use("*", authMiddleware);

quizShareRoute.get("/shared-with-me", getSharedWithMe);

quizShareRoute.get("/my-shared-quizzes", getMySharedQuizzes);

quizShareRoute.get("/:quizId/shares", getQuizShares);

quizShareRoute.post("/", shareQuiz);

quizShareRoute.post("/multiple", shareWithMultiple);

quizShareRoute.delete("/:id", unshareQuiz);

export default quizShareRoute;
