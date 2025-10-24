import { promises as fs } from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

type Langs =
  | "english" | "french" | "chinese" | "spanish" | "tagalog" | "punjabi" | "korean";

export interface TermOut {
  id: string; // example is "C-1"
  term: {
    term: Record<Langs, string>;
    definition: Record<Langs, string>;
    documentId: string;
    userId: string;
  };
}

export interface QuestionOut {
  id: string; // example "cq-1"
  correctTermId: string; // will become the CustomFlashcard.id after DB insert
  prompt: Record<Langs, string>;
  documentId: string;
  userId: string;
}

export interface GenerateResult {
  terms: TermOut[];
  questions: QuestionOut[];
  outDir: string;
  outFile: string;
}

const OUT_BASE_DIR = path.resolve(process.cwd(), "generated", "custom");
const MODEL = "gemini-flash-latest";

function formatCustomId(prefix: "C" | "cq", n: number) {
  return `${prefix}-${n}`;
}

function makeDedupSet(words: string[]) {
  const s = new Set<string>();
  for (const w of words) s.add(w.trim().toLowerCase());
  return s;
}

export async function generateCustomFromOCR(opts: {
  ocrText: string;
  userId: string;
  documentId: string;
  existingDbTermsEnglish: string[];
}): Promise<GenerateResult> {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Missing GOOGLE_GENAI_API_KEY");
  }

  const { ocrText, userId, documentId, existingDbTermsEnglish } = opts;
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY! });

  const dedup = makeDedupSet(existingDbTermsEnglish || []);

  // 1) Extract 10 English terms + defs + 10 prompts
  const extractionPrompt = `
From the OCR text, select 10 DISTINCT, meaningful terms (no duplicates vs this list: ${existingDbTermsEnglish.slice(0, 200).join(", ")}).
For each term provide a concise English definition (10–25 words).
Also produce 10 question prompts (one per term) where the correct answer is exactly one of your selected terms. Do NOT include the exact term in the prompt text.

Return STRICT JSON ONLY:
{
  "terms": [
    { "english": "Term1", "definitionEnglish": "..." },
    ...
  ],
  "questions": [
    { "promptEnglish": "Which term refers to ... ?", "correctEnglish": "Term1" },
    ...
  ]
}

OCR:
"""${ocrText.slice(0, 6000)}"""
`.trim();

  const extractionResp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: extractionPrompt }] }],
  });

  const extractionText =
    extractionResp.text ??
    extractionResp.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ??
    "";

  let extractionJson: {
    terms: { english: string; definitionEnglish: string }[];
    questions: { promptEnglish: string; correctEnglish: string }[];
  };

  try {
    extractionJson = JSON.parse(extractionText);
  } catch {
    const m = extractionText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return valid JSON for extraction.");
    extractionJson = JSON.parse(m[0]);
  }

  const cleanTerms = (extractionJson.terms || [])
    .map((t) => ({
      english: (t.english || "").trim(),
      definitionEnglish: (t.definitionEnglish || "").trim(),
    }))
    .filter((t) => t.english && !dedup.has(t.english.toLowerCase()));

  const top10 = cleanTerms.slice(0, 10);
  if (top10.length === 0) {
    throw new Error("No usable terms after deduplication.");
  }

  const kept = new Set(top10.map((t) => t.english.toLowerCase()));
  let qEnglish = (extractionJson.questions || [])
    .filter((q) => kept.has((q.correctEnglish || "").trim().toLowerCase()))
    .slice(0, 10);

  if (qEnglish.length < top10.length) {
    const need = top10.length - qEnglish.length;
    const fillers = top10.slice(-need).map((t) => ({
      promptEnglish: `Which term matches this definition: ${t.definitionEnglish}?`,
      correctEnglish: t.english,
    }));
    qEnglish = qEnglish.concat(fillers).slice(0, 10);
  }

  // 2) Translate target languages
  const translatePrompt = `
Translate the following English terms+definitions+prompts into french, chinese, spanish, tagalog, punjabi, korean.
Return STRICT JSON ONLY:
{
  "terms": [{
    "english": "Adhesive",
    "term": { "french":"...", "chinese":"...", "spanish":"...", "tagalog":"...", "punjabi":"...", "korean":"..." },
    "definition": { "french":"...", "chinese":"...", "spanish":"...", "tagalog":"...", "punjabi":"...", "korean":"..." }
  }],
  "questions": [{
    "prompt": { "french":"...", "chinese":"...", "spanish":"...", "tagalog":"...", "punjabi":"...", "korean":"..." }
  }]
}

SOURCE:
{
  "terms": ${JSON.stringify(top10, null, 2)},
  "questions": ${JSON.stringify(qEnglish, null, 2)}
}
`.trim();

  const translateResp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: translatePrompt }] }],
  });

  const translateText =
    translateResp.text ??
    translateResp.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ??
    "";

  let translated: {
    terms: Array<{
      english: string;
      term: Partial<Record<Langs, string>>;
      definition: Partial<Record<Langs, string>>;
    }>;
    questions: Array<{ prompt: Partial<Record<Langs, string>> }>;
  };

  try {
    translated = JSON.parse(translateText);
  } catch {
    const m = translateText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return valid JSON for translations.");
    translated = JSON.parse(m[0]);
  }

  // 3) Build output arrays (IDs here are just for the JSON artifact; DB ids will be cuid/uuid)
  const termsOut: TermOut[] = top10.map((t, i) => {
    const tr = translated.terms?.find(
      (x) => (x.english || "").trim().toLowerCase() === t.english.toLowerCase()
    );
    const id = formatCustomId("C", i + 1);

    const termMap: Record<Langs, string> = {
      english: t.english,
      french: tr?.term?.french ?? t.english,
      chinese: tr?.term?.chinese ?? t.english,
      spanish: tr?.term?.spanish ?? t.english,
      tagalog: tr?.term?.tagalog ?? t.english,
      punjabi: tr?.term?.punjabi ?? t.english,
      korean: tr?.term?.korean ?? t.english,
    };

    const defMap: Record<Langs, string> = {
      english: t.definitionEnglish,
      french: tr?.definition?.french ?? t.definitionEnglish,
      chinese: tr?.definition?.chinese ?? t.definitionEnglish,
      spanish: tr?.definition?.spanish ?? t.definitionEnglish,
      tagalog: tr?.definition?.tagalog ?? t.definitionEnglish,
      punjabi: tr?.definition?.punjabi ?? t.definitionEnglish,
      korean: tr?.definition?.korean ?? t.definitionEnglish,
    };

    return {
      id,
      term: {
        term: termMap,
        definition: defMap,
        documentId,
        userId,
      },
    };
  });

  // Temporarily set correctTermId to the *index position*; controller will remap to DB ids
  const questionsOut: QuestionOut[] = qEnglish.map((q, i) => {
    const id = formatCustomId("cq", i + 1);
    const trQ = translated.questions?.[i];

    const prompt: Record<Langs, string> = {
      english: q.promptEnglish,
      french: trQ?.prompt?.french ?? q.promptEnglish,
      chinese: trQ?.prompt?.chinese ?? q.promptEnglish,
      spanish: trQ?.prompt?.spanish ?? q.promptEnglish,
      tagalog: trQ?.prompt?.tagalog ?? q.promptEnglish,
      punjabi: trQ?.prompt?.punjabi ?? q.promptEnglish,
      korean: trQ?.prompt?.korean ?? q.promptEnglish,
    };

    // provisional (index-based), will be fixed to real CustomFlashcard.id later
    return { id, correctTermId: String(i + 1), prompt, documentId, userId };
  });

  // 4) Write JSON artifact
  const outDir = path.join(OUT_BASE_DIR, documentId);
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "custom.json");
  await fs.writeFile(outFile, JSON.stringify({ terms: termsOut, questions: questionsOut }, null, 2), "utf-8");

  return { terms: termsOut, questions: questionsOut, outDir, outFile };
}
