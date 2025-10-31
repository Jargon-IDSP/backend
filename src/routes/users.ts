import { Hono } from "hono";
import { cacheMiddleware } from "../middleware/cache";
import { UserService } from "../services/userService";

const app = new Hono();
const userService = new UserService();

// Using middleware for automatic caching
app.get("/users", cacheMiddleware(300), async (c) => {
  return c.json({ message: "Users endpoint - implement with Redis if needed" });
});

// Using manual caching with cache-aside pattern
app.get("/users/:id", async (c) => {
  const userId = c.req.param("id");
  const user = await userService.getUserById(userId);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

// Invalidate cache on updates
app.put("/users/:id", async (c) => {
  const userId = c.req.param("id");
  const body = await c.req.json();
  // Invalidate cache
  await userService.invalidateUserCache(userId);

  return c.json({ success: true });
});

export default app;
