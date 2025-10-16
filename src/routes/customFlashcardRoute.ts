import { Hono } from "hono";
import customTerm from "../controllers/customTermController";
import { authMiddleware } from "../middleware/authMiddleware";

export const customTermRoute = new Hono()
  .use("*", authMiddleware)
  .get("/custom/term", customTerm);
