import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import { 
  getChatStatus, 
  getChatUser, 
  streamChat 
} from "../controllers/chatController";

export const chatRoute = new Hono();

// Public endpoint - no auth required
chatRoute.get("/", getChatStatus);

// All routes below require auth
chatRoute.use('*', authMiddleware);

chatRoute.get("/user", getChatUser);
chatRoute.post("/", streamChat);

export default chatRoute;