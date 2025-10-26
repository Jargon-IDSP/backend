import type { Context } from "hono";
import {
  validateChatRequest,
  createAIStream,
  getStreamingHeaders,
} from "./helperFunctions/aiHelper";


export const getChatStatus = (c: Context) => {
  return c.json({ 
    ok: true, 
    model: "gemini-flash-latest",
    service: "chat"
  });
};


export const getChatUser = (c: Context) => {
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  return c.json({ 
    message: "Chat user info",
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username
    }
  }, 200);
};


export const streamChat = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const validation = validateChatRequest(body);
    
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }


    if (!process.env.GOOGLE_GENAI_API_KEY) {
      console.error("Missing GOOGLE_GENAI_API_KEY");
      return c.json({ error: "AI service not configured" }, 500);
    }


    const stream = await createAIStream(validation.prompt!);
    
    return new Response(stream, {
      headers: getStreamingHeaders(),
    });

  } catch (err: any) {
    console.error("Chat error:", {
      message: err?.message,
      status: err?.status,
      stack: err?.stack,
    });
    return c.json({ 
      error: "Failed to generate response",
      details: err?.message 
    }, 500);
  }
};