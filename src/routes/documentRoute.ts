import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  getUploadUrl,
  saveDocument,
  getUserDocuments,
  getDocument,
  getDownloadUrl,
  deleteDocument,
  triggerOCR,
  getDocumentStatus,
  getDocumentTranslation,
  finalizeDocument,
  getDocumentJobStatus,
} from "../controllers/documentController";
import { generateCustomForDocument } from "../controllers/customGenController";

export const documentRoute = new Hono()
  .use("*", authMiddleware)
  .post("/upload/sign", getUploadUrl)
  .get("/", getUserDocuments)
  .post("/", saveDocument)
  .get("/:id/status", getDocumentStatus)
  .get("/:id/job-status", getDocumentJobStatus)
  .get("/:id/translation", getDocumentTranslation)
  .get("/:id/download", getDownloadUrl)
  .get("/:id", getDocument)
  .delete("/:id", deleteDocument)
  .post("/:id/finalize", finalizeDocument)

  // Manual triggers (kept for testing, hidden from UI)
  .post("/:id/ocr", triggerOCR)
  .post("/:id/generate-custom", generateCustomForDocument);