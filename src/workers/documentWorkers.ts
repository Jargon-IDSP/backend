import { Worker, Job } from "bullmq";
import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";
import { getActualQueues, queueConnection, jobOptions } from "../lib/queue";
import type {
  OCRJobData,
  TranslationJobData,
  FlashcardJobData,
} from "../lib/queue";
import {
  extractTextWithOCR,
  translateDocument,
  generateFlashcardsAndQuestionsOptimized,
  invalidateCachePattern,
} from "../controllers/documentController";

// Get actual queue instances
const { ocrQueue, translationQueue, flashcardQueue } = getActualQueues();

console.log("🔧 Initializing BullMQ workers...");

// Get the shared Redis connection for all workers
const workerConnection = queueConnection();
console.log("✅ Worker connection object created");

// OCR Worker
export const ocrWorker = new Worker<OCRJobData>(
  "document-ocr",
  async (job: Job<OCRJobData>) => {
    const { documentId, userId, fileKey, filename } = job.data;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 Processing OCR job ${job.id} for document ${documentId}`);
    console.log(`${"=".repeat(60)}\n`);

    // Update job progress
    await job.updateProgress(10);

    try {
      await job.updateProgress(30);
      const extractedText = await extractTextWithOCR(documentId, userId);

      if (!extractedText) {
        throw new Error(`No text extracted from document ${documentId}`);
      }

      await job.updateProgress(90);

      // Update document with extracted text (already done in extractTextWithOCR via performOCR)
      await invalidateCachePattern(`document:status:${documentId}`);
      await job.updateProgress(100);

      console.log(
        `✅ OCR completed for document ${documentId} (${extractedText.length} chars)`
      );

      // Preload user data once (saves DB query - both translation and flashcard need it)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { language: true },
      });
      const userLanguage = user?.language || 'english';
      console.log(`👤 User language preference: ${userLanguage}`);

      // PARALLEL EXECUTION: Translation and flashcard generation can run simultaneously!
      // Flashcard generation only needs extractedText, not translation
      const { flashcardQueue } = await import('../lib/queue');

      const [translationResult, flashcardQueueResult] = await Promise.allSettled([
        // Start translation (runs in background)
        (async () => {
          try {
            console.log(`🌐 Starting translation for document ${documentId}`);
            await translateDocument(documentId, userId, extractedText, userLanguage);
            console.log(`✅ Translation completed for document ${documentId}`);
            return { success: true };
          } catch (translationError) {
            console.error(
              `⚠️ Translation failed for ${documentId}, but continuing:`,
              translationError
            );
            // Don't throw - allow flashcard generation to continue
            return { success: false, error: translationError };
          }
        })(),
        
        // Queue flashcard generation immediately (doesn't need translation!)
        flashcardQueue.add(
          `flashcards-${documentId}`,
          {
            documentId,
            userId,
            categoryId: job.data.categoryId || 6,
            userLanguage, // Pass preloaded user language to flashcard worker
          },
          {
            ...jobOptions,
            jobId: `flashcards-${documentId}`,
          }
        ).then(() => {
          console.log(`🎴 Flashcard job queued for document ${documentId}`);
          return { success: true };
        }).catch((queueError) => {
          console.error(`❌ Failed to queue flashcard job for ${documentId}:`, queueError);
          return { success: false, error: queueError };
        }),
      ]);

      // Log results
      if (translationResult.status === 'rejected') {
        console.error(`❌ Translation promise rejected:`, translationResult.reason);
      }
      if (flashcardQueueResult.status === 'rejected') {
        console.error(`❌ Flashcard queue promise rejected:`, flashcardQueueResult.reason);
      }

      return { extractedText, textLength: extractedText.length };
    } catch (error) {
      console.error(`❌ OCR job failed for ${documentId}:`, error);
      throw error;
    }
  },
  {
    connection: workerConnection,
    concurrency: 2, // Process 2 OCR jobs concurrently
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000, // Per minute
    },
  }
);

// Translation Worker (not used anymore - translation happens in OCR worker)
// Keeping this for backwards compatibility in case there are existing queued jobs
export const translationWorker = new Worker<TranslationJobData>(
  "document-translation",
  async (job: Job<TranslationJobData>) => {
    const { documentId, userId, extractedText } = job.data;

    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `🌐 Processing translation job ${job.id} for document ${documentId}`
    );
    console.log(`${"=".repeat(60)}\n`);

    try {
      await job.updateProgress(20);

      // This function already handles all the translation logic
      await translateDocument(documentId, userId, extractedText);

      await job.updateProgress(100);

      console.log(`✅ Translation completed for document ${documentId}`);

      return { success: true };
    } catch (error) {
      console.error(`❌ Translation job failed for ${documentId}:`, error);
      throw error;
    }
  },
  {
    connection: workerConnection,
    concurrency: 3, // Process 3 translation jobs concurrently
  }
);

// Flashcard Worker - Generates both flashcards AND questions
export const flashcardWorker = new Worker<FlashcardJobData>(
  "document-flashcards",
  async (job: Job<FlashcardJobData>) => {
    const { documentId, userId, categoryId, userLanguage } = job.data;

    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `🎴 Processing flashcard & question job ${job.id} for document ${documentId}`
    );
    console.log(`${"=".repeat(60)}\n`);

    try {
      await job.updateProgress(10);

      // Get document with extracted text (should already be available since OCR queues this job)
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { extractedText: true, filename: true },
      });

      if (!document || !document.extractedText) {
        throw new Error(
          `Document ${documentId} has no extracted text - OCR may have failed`
        );
      }

      await job.updateProgress(30);
      console.log(
        `✅ Starting flashcard generation for ${document.extractedText.length} chars of text...`
      );

      // Generate flashcards and questions together (pass userLanguage to skip DB query)
      await generateFlashcardsAndQuestionsOptimized(
        documentId,
        userId,
        categoryId,
        userLanguage
      );

      await job.updateProgress(90);

      // Clear cache and mark as complete
      await invalidateCachePattern(`document:status:${documentId}`);

      await job.updateProgress(100);

      console.log(
        `✅ Flashcards & questions generated for document ${documentId}`
      );

      return { success: true };
    } catch (error) {
      console.error(
        `❌ Flashcard & question job failed for ${documentId}:`,
        error
      );
      throw error;
    }
  },
  {
    connection: workerConnection,
    concurrency: 2, // Process 2 flashcard jobs concurrently
  }
);

console.log("✅ OCR worker initialized");
console.log("✅ Translation worker initialized");
console.log("✅ Flashcard worker initialized");

// Error handlers for OCR worker
ocrWorker.on("completed", async (job) => {
  console.log(`✅ OCR job ${job.id} completed successfully`);
});

ocrWorker.on("failed", async (job, err) => {
  console.error(`❌ OCR job ${job?.id} failed after all retries:`, err.message);

  if (job) {
    const { documentId, userId, filename } = job.data;
    const attemptNumber = job.attemptsMade;

    // Create error notification (final failure)
    try {
      await createNotification({
        userId,
        type: "DOCUMENT_ERROR",
        title: "Translation Failed",
        message: `Failed to process "${filename}" after ${attemptNumber} attempts. Please try uploading again or contact support.`,
        actionUrl: `/documents`,
        documentId,
      });

      // Mark document as failed
      await prisma.document.update({
        where: { id: documentId },
        data: { ocrProcessed: true }, // Mark as processed to avoid stuck state
      });
    } catch (notifError) {
      console.error("Failed to create error notification:", notifError);
    }
  }
});

// First retry notification
let ocrRetryNotified = new Set<string>();
ocrWorker.on("error", async (err) => {
  console.error(`❌ OCR worker error:`, err);
});

// Listen for active jobs to detect retries
ocrWorker.on("active", async (job) => {
  if (job.attemptsMade > 1 && !ocrRetryNotified.has(job.id!)) {
    ocrRetryNotified.add(job.id!);
    const { documentId, userId, filename } = job.data;

    try {
      await createNotification({
        userId,
        type: "DOCUMENT_PROCESSING",
        title: "Retrying Translation",
        message: `Encountered an issue processing "${filename}". Retrying now (Attempt ${job.attemptsMade}/${jobOptions.attempts})...`,
        actionUrl: `/learning/custom/categories/${documentId}`,
        documentId,
      });
    } catch (notifError) {
      console.error("Failed to create retry notification:", notifError);
    }
  }
});

ocrWorker.on("progress", (job, progress) => {
  console.log(`📊 OCR job ${job.id} progress: ${progress}%`);
});

// Error handlers for translation worker (kept for backwards compatibility)
translationWorker.on("completed", (job) => {
  console.log(`✅ Translation job ${job.id} completed successfully`);
});

translationWorker.on("failed", async (job, err) => {
  console.error(`❌ Translation job ${job?.id} failed:`, err.message);

  if (job) {
    const { documentId, userId } = job.data;

    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { filename: true },
      });

      await createNotification({
        userId,
        type: "DOCUMENT_ERROR",
        title: "Translation Error",
        message: `Failed to translate document "${
          document?.filename || "Unknown"
        }". Processing will continue.`,
        actionUrl: `/documents`,
        documentId,
      });
    } catch (notifError) {
      console.error("Failed to create error notification:", notifError);
    }
  }
});

translationWorker.on("progress", (job, progress) => {
  console.log(`📊 Translation job ${job.id} progress: ${progress}%`);
});

// Error handlers for flashcard worker
flashcardWorker.on("completed", async (job) => {
  console.log(`✅ Flashcard job ${job.id} completed successfully`);

  const { documentId, userId } = job.data;

  try {
    // Fetch document details for notification
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { filename: true },
    });

    // Create success notification
    await createNotification({
      userId,
      type: "DOCUMENT_READY",
      title: "All Languages Saved!",
      message: `Your document "${
        document?.filename || "Unknown"
      }" is now fully processed with all 6 languages and saved to your profile.`,
      actionUrl: `/learning/documents/${documentId}/study`,
      documentId,
    });

    console.log(`📬 Success notification created for document ${documentId}`);
  } catch (notifError) {
    console.error("Failed to create success notification:", notifError);
    // Don't throw - notification failure shouldn't break the completion
  }
});

flashcardWorker.on("failed", async (job, err) => {
  console.error(
    `❌ Flashcard job ${job?.id} failed after all retries:`,
    err.message
  );

  if (job) {
    const { documentId, userId } = job.data;
    const attemptNumber = job.attemptsMade;

    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { filename: true },
      });

      await createNotification({
        userId,
        type: "DOCUMENT_ERROR",
        title: "Flashcard Generation Failed",
        message: `Failed to generate study materials for "${
          document?.filename || "Unknown"
        }" after ${attemptNumber} attempts. Please try re-uploading the document.`,
        actionUrl: `/documents`,
        documentId,
      });

      // Mark document as processed to avoid stuck state
      await prisma.document.update({
        where: { id: documentId },
        data: { ocrProcessed: true },
      });
    } catch (notifError) {
      console.error("Failed to create error notification:", notifError);
    }
  }
});

// Retry notification for flashcard worker
let flashcardRetryNotified = new Set<string>();
flashcardWorker.on("active", async (job) => {
  if (job.attemptsMade > 1 && !flashcardRetryNotified.has(job.id!)) {
    flashcardRetryNotified.add(job.id!);
    const { documentId, userId } = job.data;

    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { filename: true },
      });

      await createNotification({
        userId,
        type: "DOCUMENT_PROCESSING",
        title: "Retrying Flashcard Generation",
        message: `Encountered an issue generating study materials for "${
          document?.filename || "your document"
        }". Retrying now (Attempt ${job.attemptsMade}/${
          jobOptions.attempts
        })...`,
        actionUrl: `/learning/custom/categories/${documentId}`,
        documentId,
      });
    } catch (notifError) {
      console.error("Failed to create retry notification:", notifError);
    }
  }
});

flashcardWorker.on("progress", (job, progress) => {
  console.log(`📊 Flashcard job ${job.id} progress: ${progress}%`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, closing workers...");
  await Promise.all([
    ocrWorker.close(),
    translationWorker.close(),
    flashcardWorker.close(),
  ]);
  console.log("✅ Workers closed");
});

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received, closing workers...");
  await Promise.all([
    ocrWorker.close(),
    translationWorker.close(),
    flashcardWorker.close(),
  ]);
  console.log("✅ Workers closed");
  process.exit(0);
});
