import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { connectRedis } from "./lib/redis";
import redisClient from "./lib/redis";

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

  // Initialize BullMQ workers only if Redis is available
  try {
    // Check if Redis is available first by attempting a simple operation
    const testRedis = await redisClient.ping();
    if (testRedis === 'PONG') {
      // Import workers to initialize them
      await import("./workers/documentWorkers");
      console.log("✅ Document processing workers initialized");
    }
  } catch (err) {
    console.warn("⚠️  Redis unavailable - workers not initialized");
    console.log("⚠️  Server will continue without background job processing");
  }

  serve({
    port,
    fetch: app.fetch,
  });

  console.log(`Server running on http://localhost:${port}`);
})();
