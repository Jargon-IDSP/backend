import { Hono } from "hono";
import { avatar } from "../controllers/avatarController";
import { authMiddleware } from "../middleware/authMiddleware";

export const avatarRoute = new Hono()
  .use("*", authMiddleware)
  .get("/avatar", avatar);
