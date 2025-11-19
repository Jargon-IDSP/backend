import { Hono } from "hono";
import { profile, updateOnboarding, markIntroductionViewed } from "../controllers/profileController";
import { authMiddleware } from "../middleware/authMiddleware";
import { avatar, updateAvatar } from "../controllers/avatarController";
import { uploadAvatarImage } from "../controllers/uploadController";

export const profileRoute = new Hono()
  .use("*", authMiddleware)
  .get("/", profile)
  .get("/avatar", avatar)
  .post("/avatar", updateAvatar)
  .post("/avatar/upload", uploadAvatarImage)
  .post("/onboarding", updateOnboarding)
  .post("/introduction-viewed", markIntroductionViewed);