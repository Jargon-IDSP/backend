import { Hono } from "hono";
import { profile } from "../controllers/profileController";
import { authMiddleware } from "../middleware/authMiddleware";

export const profileRoute = new Hono()
  .use("*", authMiddleware)
  .get("/", profile);
