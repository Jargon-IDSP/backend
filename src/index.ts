import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { initializeCache } from "./controllers/flashcardController";


const port = +(process.env.PORT || 8080);

serve({
  port,
  fetch: app.fetch,
});


console.log(`Server running on http://localhost:${port}`);
