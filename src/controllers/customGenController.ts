import type { Context } from "hono";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { generateCustomFromOCR } from "../services/customCardGenerator";

/**
 * POST /documents/:id/generate-custom
 * Body: none (uses OCR'd Document.extractedText)
 * Auth: via authMiddleware (uses c.get('user'))
 */
export const generateCustomForDocument = async (c: Context) => {
  const user = c.get("user");
  if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

  const docId = c.req.param("id");
  if (!docId) return c.json({ error: "Missing documentId" }, 400);

  // 1) Load document & ensure ownership + extracted text present
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return c.json({ error: "Document not found" }, 404);
  if (doc.userId !== user.id) return c.json({ error: "Forbidden" }, 403);
  if (!doc.extractedText) {
    return c.json({ error: "This document has no OCR text yet. Run OCR first." }, 400);
  }

  // 2) Get existing terms (to avoid dupes) – from core Flashcards + user’s CustomFlashcards
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

  // 3) Generate with Gemini → terms/questions + JSON artifact
  const gen = await generateCustomFromOCR({
    ocrText: doc.extractedText,
    userId: user.id,
    documentId: doc.id,
    existingDbTermsEnglish,
  });

  // 4) Save to DB (CustomFlashcard + CustomQuestion)
  // We must create flashcards first to get their ids, then map questions.
  // We'll assign ids ourselves so we can map directly (no second query).
  type CF = {
    id: string;
    documentId: string | null;
    userId: string;

    termEnglish: string;
    termFrench: string;
    termChinese: string;
    termSpanish: string;
    termTagalog: string;
    termPunjabi: string;
    termKorean: string;

    definitionEnglish: string;
    definitionFrench: string;
    definitionChinese: string;
    definitionSpanish: string;
    definitionTagalog: string;
    definitionPunjabi: string;
    definitionKorean: string;
  };

  const toSaveCards: CF[] = gen.terms.map((t) => {
    const id = crypto.randomUUID(); // prisma model: CustomFlashcard.id is String @id @default(cuid()) but you can provide your own
    return {
      id,
      documentId: doc.id,
      userId: user.id,

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
    };
  });

  // Map index (1..N) to id for question correctTermId
  const indexToId = new Map<number, string>();
  toSaveCards.forEach((cf, i) => indexToId.set(i + 1, cf.id));

  const toSaveQs = gen.questions.map((q, i) => {
    const index = Number(q.correctTermId) || (i + 1);
    const correctId = indexToId.get(index)!;

    return {
      id: crypto.randomUUID(),
      userId: user.id,
      customQuizId: null, // not attached to a quiz yet

      correctTermId: correctId,

      promptEnglish: q.prompt.english,
      promptFrench: q.prompt.french,
      promptChinese: q.prompt.chinese,
      promptSpanish: q.prompt.spanish,
      promptTagalog: q.prompt.tagalog,
      promptPunjabi: q.prompt.punjabi,
      promptKorean: q.prompt.korean,
    };
  });

  // Persist
  await prisma.$transaction([
    ...toSaveCards.map((data) => prisma.customFlashcard.create({ data })),
    ...toSaveQs.map((data) => prisma.customQuestion.create({ data })),
  ]);

  return c.json({
    ok: true,
    savedFlashcards: toSaveCards.length,
    savedQuestions: toSaveQs.length,
    jsonFile: gen.outFile,
  });
};
