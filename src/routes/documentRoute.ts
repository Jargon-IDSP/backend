import { Hono } from "hono";
import { getUploadUrl, saveDocument, getUserDocuments, getDocument, getDownloadUrl } from "../controllers/documentController";
// import { authMiddleware } from "../middleware/authMiddleware";

export const documentRoute = new Hono()
  // .use("*", authMiddleware)
 .post("/upload/sign", getUploadUrl)
  .post("/", saveDocument)          
  .get("/", getUserDocuments)
  .get("/:id", getDocument)
  .get("/:id/download", getDownloadUrl);