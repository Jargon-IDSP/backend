import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-flash-latest";


function getAIClient() {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Missing GOOGLE_GENAI_API_KEY");
  }
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });
}


function extractResponseText(response: any): string {
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