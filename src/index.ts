import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { connectRedis } from "./lib/redis";

const port = +(process.env.PORT || 8080);

// Ensure Redis is connected before starting the server
(async () => {
  try {
    await connectRedis();
    console.log("✅ Redis connected successfully");
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
    console.log("⚠️  Server will continue without caching");
  }

  serve({
    port,
    fetch: app.fetch,
  });

  console.log(`Server running on http://localhost:${port}`);
})();
