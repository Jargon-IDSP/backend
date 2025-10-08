import { Hono } from "hono";
import { chat } from "../controllers/chatController";
import { authMiddleware } from "../middleware/authMiddleware";

export const chatRoute = new Hono()
  .use("*", authMiddleware)
  .get("/", chat);
