import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import { 
  getChatStatus, 
  getChatUser, 
  streamChat 
} from "../controllers/chatController";

export const chatRoute = new Hono();

chatRoute.get("/", getChatStatus);

chatRoute.use('*', authMiddleware);

chatRoute.get("/user", getChatUser);
chatRoute.post("/", streamChat);

export default chatRoute;