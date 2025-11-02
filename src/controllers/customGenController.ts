import type { Context } from "hono";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { generateCustomFromOCR } from "./helperFunctions/customFlashcardHelper";
import redisClient from "../lib/redis";

// Helper function to invalidate cache by pattern
const invalidateCachePattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(
        `🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`
      );
    }
  } catch (error) {
    console.error(`Error invalidating cache pattern ${pattern}:`, error);
  }
};

export const generateCustomForDocument = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

    const docId = c.req.param("id");
    if (!docId) return c.json({ error: "Missing documentId" }, 400);

    const body = await c.req.json().catch(() => ({}));

    // Map category name to ID if provided, otherwise use document's category or default to General
    const categoryMap: Record<string, number> = {
      'SAFETY': 1, 'safety': 1,
      'TECHNICAL': 2, 'technical': 2,
      'TRAINING': 3, 'training': 3,
      'WORKPLACE': 4, 'workplace': 4,
      'PROFESSIONAL': 5, 'professional': 5,
      'GENERAL': 6, 'general': 6,
    };

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) return c.json({ error: "Document not found" }, 404);
    if (doc.userId !== user.id) return c.json({ error: "Forbidden" }, 403);
    if (!doc.extractedText) {
      return c.json(
        { error: "This document has no OCR text yet. Run OCR first." },
        400
      );
    }

    // Use category from body if provided, otherwise use document's category
    const categoryId = body.category
      ? (categoryMap[body.category] || doc.categoryId || 6)
      : (doc.categoryId || 6);

    const [core, custom] = await Promise.all([
      prisma.flashcard.findMany({ select: { termEnglish: true } }),
      prisma.customFlashcard.findMany({
        where: { userId: user.id },
        select: { termEnglish: true },
      }),
    ]);

    const existingDbTermsEnglish = [
      ...core.map((t) => t.termEnglish),
      ...custom.map((t) => t.termEnglish),
    ];

    const gen = await generateCustomFromOCR({
      ocrText: doc.extractedText,
      userId: user.id,
      documentId: doc.id,
      existingDbTermsEnglish,
    });

    const quizData = {
      id: crypto.randomUUID(),
      userId: user.id,
      documentId: doc.id,
      name: doc.filename,
      categoryId: categoryId,
      pointsPerQuestion: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const toSaveCards = gen.terms.map((t) => ({
      id: crypto.randomUUID(),
      documentId: doc.id,
      userId: user.id,
      categoryId: categoryId,
      termEnglish: t.term.term.english,
      termFrench: t.term.term.french,
      termChinese: t.term.term.chinese,
      termSpanish: t.term.term.spanish,
      termTagalog: t.term.term.tagalog,
      termPunjabi: t.term.term.punjabi,
      termKorean: t.term.term.korean,
      definitionEnglish: t.term.definition.english,
      definitionFrench: t.term.definition.french,
      definitionChinese: t.term.definition.chinese,
      definitionSpanish: t.term.definition.spanish,
      definitionTagalog: t.term.definition.tagalog,
      definitionPunjabi: t.term.definition.punjabi,
      definitionKorean: t.term.definition.korean,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const indexToId = new Map<number, string>();
    toSaveCards.forEach((cf, i) => indexToId.set(i + 1, cf.id));

    const toSaveQs = gen.questions.map((q, i) => {
      const index = Number(q.correctTermId) || i + 1;
      const correctId = indexToId.get(index)!;

      return {
        id: crypto.randomUUID(),
        userId: user.id,
        customQuizId: quizData.id,
        correctTermId: correctId,
        categoryId: categoryId,
        promptEnglish: q.prompt.english,
        promptFrench: q.prompt.french,
        promptChinese: q.prompt.chinese,
        promptSpanish: q.prompt.spanish,
        promptTagalog: q.prompt.tagalog,
        promptPunjabi: q.prompt.punjabi,
        promptKorean: q.prompt.korean,
        pointsWorth: 10,
        createdAt: new Date(),
      };
    });

    await prisma.$transaction([
      prisma.customQuiz.create({ data: quizData }),
      ...toSaveCards.map((data) => prisma.customFlashcard.create({ data })),
      ...toSaveQs.map((data) => prisma.customQuestion.create({ data })),
    ]);

    // ✅ INVALIDATE CACHES after successful generation
    // This ensures users see their newly generated flashcards and questions
    console.log("🔄 Invalidating caches after custom generation...");
    await Promise.all([
      // Invalidate custom flashcard caches for this user
      invalidateCachePattern(`custom:user:${user.id}:*`),
      invalidateCachePattern(`custom:category:${user.id}:*`),

      // Invalidate custom flashcard caches for this document
      invalidateCachePattern(`custom:document:${doc.id}:*`),

      // Invalidate custom question caches for this user
      invalidateCachePattern(`questions:user:${user.id}:*`),
      invalidateCachePattern(`questions:document:${doc.id}:*`),

      // Invalidate custom quiz caches
      invalidateCachePattern(`quizzes:user:${user.id}:*`),
    ]);
    console.log("✅ Cache invalidation complete");

    return c.json({
      ok: true,
      quizId: quizData.id,
      quizName: doc.filename,
      category: category,
      savedFlashcards: toSaveCards.length,
      savedQuestions: toSaveQs.length,
    });
  } catch (error) {
    console.error("Generation error:", error);
    return c.json(
      {
        error: "Failed to generate custom flashcards",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
};
