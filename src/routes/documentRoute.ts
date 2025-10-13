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
  //  .post("/upload/sign", getUploadUrl)
  .post(
    "https://jargon.app.n8n.cloud/webhook-test/abf12181-f712-4a14-b258-389a2ebb81d3",
    getUploadUrl
  )
  .get("/:id/download", getDownloadUrl)
  .delete("/:id", deleteDocument)
  .get("/:id", getDocument)
  .post("/", saveDocument)
  .get("/", getUserDocuments);
