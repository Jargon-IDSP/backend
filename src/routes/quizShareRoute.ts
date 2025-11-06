import { Hono } from "hono";
import {
  updateQuizVisibility,
  shareQuizWithFriend,
  unshareQuiz,
  getQuizShares,
  getSharedWithMe,
  getMySharedQuizzes,
  shareWithMultipleFriends,
} from "../controllers/quizShareController";
import { authMiddleware } from "../middleware/authMiddleware";

const quizShareRoute = new Hono();

quizShareRoute.use("*", authMiddleware);

// Get shared quizzes
quizShareRoute.get("/shared-with-me", getSharedWithMe);
quizShareRoute.get("/my-shared-quizzes", getMySharedQuizzes);
quizShareRoute.get("/:quizId/shares", getQuizShares);

// Update visibility
quizShareRoute.put("/visibility", updateQuizVisibility);

// Share with specific friends (SPECIFIC visibility only)
quizShareRoute.post("/", shareQuizWithFriend);
quizShareRoute.post("/multiple", shareWithMultipleFriends);

// Unshare
quizShareRoute.delete("/:id", unshareQuiz);

export default quizShareRoute;
