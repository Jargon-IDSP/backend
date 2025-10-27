import type { Context, Next } from "hono";
import redisClient from "../lib/redis";

export const cacheMiddleware = (ttl: number = 300) => {
  return async (c: Context, next: Next) => {
    const key = `cache:${c.req.method}:${c.req.url}`;

    try {
      // Try to get cached response
      const cached = await redisClient.get(key);

      if (cached) {
        console.log("Cache HIT:", key);
        return c.json(JSON.parse(cached));
      }

      console.log("Cache MISS:", key);

      // Continue to route handler
      await next();

      // Cache the response if it's successful
      const response = c.res.clone();
      if (response.status === 200) {
        const body = await response.json();
        await redisClient.setEx(key, ttl, JSON.stringify(body));
      }
    } catch (error) {
      console.error("Cache middleware error:", error);
      await next(); // Fallback to non-cached response
    }
  };
};
