import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";


const port = +(process.env.PORT || 8080);

serve({
  port,
  fetch: app.fetch,
});
console.log("ENV CHECK", {
  cwd: process.cwd(),
  hasPK: !!process.env.CLERK_PUBLISHABLE_KEY,
  hasSK: !!process.env.CLERK_SECRET_KEY,
  hasGemini: !!process.env.GOOGLE_GENAI_API_KEY,
});


console.log(`Server running on http://localhost:${port}`);
