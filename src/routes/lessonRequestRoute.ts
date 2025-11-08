import { Hono } from "hono";
import {
  createLessonRequest,
  cancelLessonRequest,
  acceptLessonRequest,
  denyLessonRequest,
  getLessonRequests,
  checkLessonAccess,
  getLessonRequestStatus,
  getLessonRequestById,
} from "../controllers/lessonRequestController";
import { authMiddleware } from "../middleware/authMiddleware";

const lessonRequestRoute = new Hono();

lessonRequestRoute.use("*", authMiddleware);

// Create a lesson request
lessonRequestRoute.post("/", createLessonRequest);

// Cancel a lesson request
lessonRequestRoute.delete("/", cancelLessonRequest);

// Accept a lesson request
lessonRequestRoute.post("/accept", acceptLessonRequest);

// Deny a lesson request
lessonRequestRoute.post("/deny", denyLessonRequest);

// Get lesson requests for current user (received)
lessonRequestRoute.get("/", getLessonRequests);

// Check if user has access to another user's lessons
lessonRequestRoute.get("/access/:userId", checkLessonAccess);

// Get lesson request status between two users
lessonRequestRoute.get("/status/:userId", getLessonRequestStatus);

// Get lesson request by ID (for notifications) - must come after specific routes
lessonRequestRoute.get("/:id", getLessonRequestById);

export default lessonRequestRoute;

