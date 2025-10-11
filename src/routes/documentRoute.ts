import { Hono } from "hono";
import { getUploadUrl, saveDocument, getUserDocuments, getDocument } from "../controllers/documentController";
// import { authMiddleware } from "../middleware/authMiddleware";

export const addDocumentRoute = new Hono()
  // .use("*", authMiddleware)
 .post("/upload/sign", getUploadUrl)
  .post("/", saveDocument)          
  .get("/", getUserDocuments)
  .get("/:id", getDocument);