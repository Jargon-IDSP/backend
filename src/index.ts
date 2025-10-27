import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = +(process.env.PORT || 8080);

serve({
  port,
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${port}`);
