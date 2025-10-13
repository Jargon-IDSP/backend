import { Hono } from "hono";
import {
  getUploadUrl,
  saveDocument,
  getUserDocuments,
  getDocument,
  getDownloadUrl,
  deleteDocument,
} from "../controllers/documentController";
import { authMiddleware } from "../middleware/authMiddleware";

export const documentRoute = new Hono()
  .use("*", authMiddleware)
  .post("/upload/sign", getUploadUrl)
  .get("/:id/download", getDownloadUrl)
  .delete("/:id", deleteDocument)
  .get("/:id", getDocument)
  .post("/", saveDocument)
  .get("/", getUserDocuments);
