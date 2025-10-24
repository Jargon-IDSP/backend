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
  // saveOCRResult,
} from "../controllers/documentController";
import { generateCustomForDocument } from "../controllers/customGenController";



export const documentRoute = new Hono()
  .use("*", authMiddleware)
  .post("/upload/sign", getUploadUrl)
  // .post("/ocr-result", saveOCRResult)
  .get("/", getUserDocuments)
  .post("/", saveDocument)
  .post("/:id/ocr", triggerOCR)
  .post("/:id/generate-custom", generateCustomForDocument)
  .get("/:id/download", getDownloadUrl)
  .get("/:id", getDocument)
  .delete("/:id", deleteDocument);
  
