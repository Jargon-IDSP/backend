import { Hono } from "hono";
import { avatar, updateAvatar } from "../controllers/avatarController";
import { authMiddleware } from "../middleware/authMiddleware";

export const avatarRoute = new Hono()
  .use("*", authMiddleware)
  .get("/edit", avatar)
  .put("/edit", updateAvatar);
