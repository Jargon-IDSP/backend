import { Hono } from "hono";
import customQuestion from "../controllers/customQuestionController";
import { authMiddleware } from "../middleware/authMiddleware";


export const customQuestionRoute = new Hono()
  .use("*", authMiddleware);
