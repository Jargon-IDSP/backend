import { Hono } from "hono";
import { GoogleGenAI } from "@google/genai";
import { createClerkClient } from "@clerk/backend";

export const chatRoute = new Hono();

// --- Google GenAI client
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY!,
});

// --- Clerk client
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!, // already present in your .env
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY, // optional
});

// Health check
chatRoute.get("/", (c) => c.json({ ok: true, model: "gemini-flash-latest" }));

// POST /chat — stream plain text
chatRoute.post("/", async (c) => {
  // Authenticate the request via Clerk
  const auth = await clerk.authenticateRequest(c.req.raw, {
    // jwtKey: process.env.CLERK_JWT_KEY, // optional if you use JWKS
  });

  if (!auth.isSignedIn) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Read payload
  const body = await c.req.json().catch(() => ({}));
  const prompt: string = (body?.prompt as string) || "";
  if (!prompt.trim()) return c.json({ error: "Prompt is required" }, 400);

  // Guard: fail fast if the API key is not configured
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    return c.json({ error: "Server missing GOOGLE_GENAI_API_KEY" }, 500);
  }

  try {
    // New SDK shape: returns an async iterable
    const stream = await ai.models.generateContentStream({
      model: "gemini-flash-latest",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // generationConfig: { temperature: 0.7 }, // optional
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            // chunk.text is a getter (string | undefined), not a function
            const text =
              chunk.text ??
              chunk.candidates?.[0]?.content?.parts
                ?.map((p: any) => p?.text || "")
                .join("") ??
              "";

            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (err) {
          // Optional: emit a tail marker to the client if streaming fails
          controller.enqueue(encoder.encode("\n[stream ended]\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    // Make the actual provider error visible in logs
    console.error("Gemini stream error:", {
      message: err?.message,
      status: err?.status,
      data: err?.response?.data,
    });
    return c.json({ error: "Failed to generate response" }, 500);
  }
});

export default chatRoute;
