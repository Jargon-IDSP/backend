import { Hono } from "hono";
import { getUploadUrl } from "../controllers/documentController";
// import { authMiddleware } from "../middleware/authMiddleware";

export const addDocumentRoute = new Hono()
  // .use("*", authMiddleware)
  .post("/upload/sign", getUploadUrl);