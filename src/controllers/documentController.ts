// controllers/documentController.ts
import type { Context } from "hono";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/s3";
import { prisma } from "../lib/prisma";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";

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
    const { fileKey, filename, fileType, fileSize } = await c.req.json();

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

    // Find the document
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Delete from S3
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    await s3.send(deleteCommand);

    // Delete from database
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

    console.log("=== Starting OCR Processing ===");
    console.log("Document ID:", document.id);
    console.log("Filename:", document.filename);
    console.log("File Type:", document.fileType);

    // Prepare Nanonets API call
    const apiKey = process.env.NANONETS_API_KEY;
    const modelId = process.env.NANONETS_MODEL_ID;

    if (!apiKey || !modelId) {
      throw new Error("Nanonets API credentials not configured");
    }

    console.log("Uploading to Nanonets API...");
    console.log("Model ID:", modelId);

    // Get the file from R2/S3
    const getCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });

    console.log("Downloading file from R2...");
    const s3Response = await s3.send(getCommand);

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of s3Response.Body as any) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    console.log("File downloaded, size:", fileBuffer.length, "bytes");

    // Save to temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(
      tempDir,
      `nanonets-${Date.now()}-${document.filename}`
    );

    console.log("Writing to temp file:", tempFilePath);
    fs.writeFileSync(tempFilePath, fileBuffer);
    console.log("Temp file written successfully");

    let ocrResult;
    try {
      // Create FormData with file stream
      const FormData = (await import("form-data")).default;
      const formData = new FormData();

      // Use createReadStream for proper file streaming
      formData.append("file", fs.createReadStream(tempFilePath), {
        filename: document.filename,
        contentType: document.fileType || "application/octet-stream",
      });

      console.log("FormData created with file stream, making API call...");

      // Use SYNC endpoint for immediate results (simpler, works for files under 3 pages)
      const nanoResponse = await axios.post(
        `https://app.nanonets.com/api/v2/OCR/Model/${modelId}/LabelFile/`,
        formData,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(apiKey + ":").toString(
              "base64"
            )}`,
            ...formData.getHeaders(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 120000, // 2 minute timeout for sync processing
        }
      );

      console.log("Nanonets Response Status:", nanoResponse.status);
      console.log("Sync processing complete");

      // Parse Nanonets response (sync returns predictions immediately)
      ocrResult = nanoResponse.data;
      console.log(
        "OCR Result received from Nanonets:",
        JSON.stringify(ocrResult, null, 2)
      );
    } catch (uploadError) {
      console.error("Upload to Nanonets failed:", uploadError);
      throw uploadError;
    } finally {
      // Clean up temp file - this runs AFTER axios completes (success or fail)
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Temp file deleted");
        }
      } catch (unlinkError) {
        console.error("Failed to delete temp file:", unlinkError);
      }
    }

    // Extract text from Nanonets response (ALL PAGES, ALL TEXT)
    let extractedText = "";
    let terms: Array<{ term: string; definition: string }> = [];
    let allTextSegments: string[] = [];

    if (ocrResult.result && ocrResult.result.length > 0) {
      console.log(
        `Processing ${ocrResult.result.length} pages from OCR result`
      );

      // Process ALL pages in the result
      for (const pageResult of ocrResult.result) {
        const prediction = pageResult.prediction;
        const pageNumber = pageResult.page;

        if (Array.isArray(prediction)) {
          if (prediction.length > 0) {
            console.log(
              `Page ${pageNumber}: Found ${prediction.length} predictions`
            );

            // Extract ALL OCR text from this page (regardless of label)
            const pageText = prediction
              .map((pred: any) => pred.ocr_text || "")
              .filter((text: string) => text.trim())
              .join("\n");

            if (pageText.trim()) {
              allTextSegments.push(
                `\n=== Page ${pageNumber + 1} ===\n${pageText}`
              );
            }

            // Extract term-definition pairs from this page
            for (let i = 0; i < prediction.length; i++) {
              const pred = prediction[i];
              if (
                pred.label === "term" &&
                prediction[i + 1]?.label === "definition"
              ) {
                terms.push({
                  term: pred.ocr_text,
                  definition: prediction[i + 1].ocr_text,
                });
                console.log(
                  `Found term-definition pair on page ${pageNumber}: ${pred.ocr_text}`
                );
              }
            }
          } else {
            console.log(
              `Page ${pageNumber}: Empty predictions array - may be a blank page or OCR failed`
            );
            // Still add a marker for this page
            allTextSegments.push(
              `\n=== Page ${
                pageNumber + 1
              } ===\n[No text detected on this page]`
            );
          }
        } else {
          console.log(`Page ${pageNumber}: No predictions array found`);
        }
      }

      // Combine all text from all pages
      extractedText = allTextSegments.join("\n");

      console.log("Total extracted text length:", extractedText.length);
      console.log("Total term-definition pairs found:", terms.length);
      console.log("Pages processed:", ocrResult.result.length);
      if (extractedText.length > 0) {
        console.log("Text preview:", extractedText.substring(0, 300));
      }
    } else {
      console.warn("No OCR results found in Nanonets response");
    }

    // Update document with OCR results
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        extractedText: extractedText,
        ocrProcessed: true,
      },
    });

    console.log("Document updated with OCR results");

    // Create flashcards if terms were extracted
    let flashcardsCreated = 0;
    if (terms && terms.length > 0) {
      const flashcards = await Promise.all(
        terms.map((item) =>
          prisma.customFlashcard.create({
            data: {
              documentId: document.id,
              userId: user.id,
              termEnglish: item.term,
              definitionEnglish: item.definition,
              termFrench: "",
              termChinese: "",
              termSpanish: "",
              termTagalog: "",
              termPunjabi: "",
              termKorean: "",
              definitionFrench: "",
              definitionChinese: "",
              definitionSpanish: "",
              definitionTagalog: "",
              definitionPunjabi: "",
              definitionKorean: "",
            },
          })
        )
      );

      flashcardsCreated = flashcards.length;
      console.log("Created flashcards:", flashcardsCreated);
    }

    console.log("=== OCR Processing Complete ===");

    return c.json({
      message: "OCR processing completed successfully",
      extractedText:
        extractedText.substring(0, 500) +
        (extractedText.length > 500 ? "..." : ""),
      textLength: extractedText.length,
      flashcardsCreated: flashcardsCreated,
      document: updatedDocument,
    });
  } catch (error) {
    console.error("=== OCR Processing Error ===");

    // Handle axios-specific errors
    if (axios.isAxiosError(error) && error.response) {
      console.error("Nanonets Error Response:", error.response.data);
      return c.json(
        {
          error: `Nanonets API failed (${
            error.response.status
          }): ${JSON.stringify(error.response.data)}`,
        },
        500
      );
    }

    // Handle other errors
    console.error(error);
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};
