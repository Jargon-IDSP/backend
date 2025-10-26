import { GoogleGenAI } from "@google/genai";

export const MODEL = "gemini-flash-latest";


function getAIClient() {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Missing GOOGLE_GENAI_API_KEY");
  }
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });
}


export function extractResponseText(response: any): string {
  return (
    response.text ??
    response.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ??
    ""
  );
}


export function parseJSONResponse<T>(responseText: string): T {
  try {
    return JSON.parse(responseText);
  } catch {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse JSON response");
    return JSON.parse(match[0]);
  }
}


export async function callGenAI(prompt: string): Promise<string> {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return extractResponseText(response);
}


export async function callGenAIForJSON<T>(prompt: string): Promise<T> {
  const responseText = await callGenAI(prompt);
  return parseJSONResponse<T>(responseText);
}


export function extractChunkText(chunk: any): string {
  return (
    chunk.text ??
    chunk.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || "")
      .join("") ??
    ""
  );
}


export async function createAIStream(prompt: string, model: string = MODEL) {
  const ai = getAIClient();
  
  const stream = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = extractChunkText(chunk);
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
        controller.enqueue(encoder.encode("\n[Stream error occurred]\n"));
      } finally {
        controller.close();
      }
    },
  });
}


export function getStreamingHeaders() {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
}


export function validateChatRequest(body: any): { 
  valid: boolean; 
  prompt?: string; 
  error?: string;
} {
  const prompt = body?.prompt as string;
  
  if (!prompt || typeof prompt !== "string") {
    return { valid: false, error: "Prompt is required" };
  }
  
  if (!prompt.trim()) {
    return { valid: false, error: "Prompt cannot be empty" };
  }
  
  return { valid: true, prompt: prompt.trim() };
}