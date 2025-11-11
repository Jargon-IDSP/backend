import { Hono } from "hono";
import {
  updateQuizVisibility,
  shareQuizWithFriend,
  unshareQuiz,
  getQuizShares,
  getSharedWithMe,
  getMySharedQuizzes,
  shareWithMultipleFriends,
  requestQuizAccess,
  getPendingRequestsFromUser,
  getMyRequestsToUser,
  denyQuizAccess,
} from "../controllers/quizShareController";
import { authMiddleware } from "../middleware/authMiddleware";

const quizShareRoute = new Hono();

quizShareRoute.use("*", authMiddleware);

// Get shared quizzes
quizShareRoute.get("/shared-with-me", getSharedWithMe);
quizShareRoute.get("/my-shared-quizzes", getMySharedQuizzes);
quizShareRoute.get("/:quizId/shares", getQuizShares);

// Get pending requests from a specific user
quizShareRoute.get("/pending-requests/:requesterId", getPendingRequestsFromUser);

// Get my requests to a specific user
quizShareRoute.get("/my-requests/:ownerId", getMyRequestsToUser);

// Update visibility
quizShareRoute.put("/visibility", updateQuizVisibility);

// Request access to a quiz
quizShareRoute.post("/request-access", requestQuizAccess);

// Deny quiz access request
quizShareRoute.post("/deny-access", denyQuizAccess);

// Share with specific friends (SPECIFIC visibility only)
quizShareRoute.post("/", shareQuizWithFriend);
quizShareRoute.post("/multiple", shareWithMultipleFriends);

// Unshare
quizShareRoute.delete("/:id", unshareQuiz);

export default quizShareRoute;
