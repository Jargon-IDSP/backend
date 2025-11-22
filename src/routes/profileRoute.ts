import { Hono } from "hono";
import { profile, updateOnboarding, markIntroductionViewed, updateSocialMedia } from "../controllers/profileController";
import { authMiddleware } from "../middleware/authMiddleware";
import { avatar } from "../controllers/avatarController";

export const profileRoute = new Hono()
  .use("*", authMiddleware)
  .get("/", profile)
  .get("/avatar", avatar)
  .post("/onboarding", updateOnboarding)
  .post("/introduction-viewed", markIntroductionViewed)
  .patch("/social-media", updateSocialMedia);