import type { Context } from "hono";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/s3";
import { prisma } from "../lib/prisma";
import { getGoogleAccessToken } from "../lib/OCRData";

export const getUploadUrl = async (c: Context) => {
  try {
    const { filename, type } = await c.req.json();

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const key = `documents/${user.id}/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      ContentType: type,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return c.json({ uploadUrl, key });
  } catch (error) {
    console.error("Upload URL error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const saveDocument = async (c: Context) => {
  try {
    const { fileKey, filename, fileType, fileSize, extractedText } = await c.req.json();

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.create({
      data: {
        filename,
        fileKey,
        fileUrl: fileKey,
        fileType,
        fileSize: fileSize || null,
        extractedText: extractedText || null,
        ocrProcessed: extractedText ? true : false,
        userId: user.id,
      },
    });

    return c.json({ document });
  } catch (error) {
    console.error("Save document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getUserDocuments = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return c.json({ documents });
  } catch (error) {
    console.error("Get documents error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDocument = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({ document });
  } catch (error) {
    console.error("Get document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDownloadUrl = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return c.json({ downloadUrl });
  } catch (error) {
    console.error("Get download URL error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const deleteDocument = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    await s3.send(deleteCommand);

    await prisma.document.delete({
      where: { id },
    });

    return c.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const triggerOCR = async (c: Context) => {
  try {
    const id = c.req.param("id");

    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    console.log("=== Starting Google Document AI OCR ===");
    console.log("Document ID:", document.id);
    console.log("Filename:", document.filename);
    console.log("File Type:", document.fileType);

    // Only process PDFs
    if (document.fileType !== "application/pdf") {
      return c.json({ error: "Only PDF files can be processed" }, 400);
    }

    // Download file from Cloudflare R2
    console.log("Downloading file from R2...");
    const getCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    const s3Response = await s3.send(getCommand);

    const chunks: Uint8Array[] = [];
    for await (const chunk of s3Response.Body as any) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    console.log("File downloaded, size:", fileBuffer.length, "bytes");

    // Convert to base64
    const base64Content = fileBuffer.toString("base64");

    // Get Google access token and process with Document AI
    console.log("Getting Google access token...");
    const accessToken = await getGoogleAccessToken();

    console.log("Processing with Google Document AI...");
    const { getGoogleCloudConfig } = await import("../lib/OCRData");
    const config = getGoogleCloudConfig();
    const { projectId, location, processorId } = config;

    if (!projectId || !processorId) {
      throw new Error("Missing GCP_PROJECT_ID or PROCESSOR_ID in environment");
    }

    const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

    const requestBody = {
      rawDocument: {
        content: base64Content,
        mimeType: "application/pdf",
      },
      skipHumanReview: true,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Document AI error: ${error}`);
    }

    const result: any = await response.json();

    // Parse the response
    const doc = result.document;
    if (!doc) {
      throw new Error("Invalid response from Document AI");
    }

    const extractedText = doc.text || "";
    const pagesCount = doc.pages?.length || 0;

    console.log("Document AI Response:", {
      textLength: extractedText.length,
      pagesCount,
    });

    // Extract pages info
    const pages: Array<{ pageNumber: number; text: string }> = [];
    if (doc.pages) {
      doc.pages.forEach((page: any, index: number) => {
        const pageText = extractPageText(extractedText, page);
        pages.push({
          pageNumber: index + 1,
          text: pageText,
        });
      });
    }

    // Update document with extracted text
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        extractedText: extractedText,
        ocrProcessed: true,
      },
    });

    console.log("Document updated with OCR results");
    console.log("Total extracted text length:", extractedText.length);
    console.log("Pages processed:", pagesCount);
    console.log("Text preview:", extractedText.substring(0, 200));

    console.log("=== OCR Processing Complete ===");

    return c.json({
      message: "OCR processing completed successfully",
      extractedText:
        extractedText.substring(0, 500) +
        (extractedText.length > 500 ? "..." : ""),
      textLength: extractedText.length,
      pagesCount: pagesCount,
      document: updatedDocument,
    });
  } catch (error) {
    console.error("=== OCR Processing Error ===");
    console.error(error);
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};

// Helper function to extract text from a page
function extractPageText(fullText: string, page: any): string {
  if (!page.layout || !page.layout.textAnchor) {
    return "";
  }

  const textAnchor = page.layout.textAnchor;
  if (!textAnchor.textSegments) {
    return "";
  }

  let pageText = "";
  textAnchor.textSegments.forEach((segment: any) => {
    const startIndex = parseInt(segment.startIndex || "0");
    const endIndex = parseInt(segment.endIndex || fullText.length);
    pageText += fullText.substring(startIndex, endIndex);
  });

  return pageText;
}
