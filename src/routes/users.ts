import { Hono } from "hono";
import { cacheMiddleware } from "../middleware/cache";
import { UserService } from "../services/userService";
import { db } from "../lib/database";

const app = new Hono();
const userService = new UserService();

// Using middleware for automatic caching
app.get("/users", cacheMiddleware(300), async (c) => {
  const users = await db.query("SELECT * FROM users");
  return c.json(users);
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

  // Update database
  await db.query("UPDATE users SET ? WHERE id = ?", [body, userId]);

  // Invalidate cache
  await userService.invalidateUserCache(userId);

  return c.json({ success: true });
});

export default app;
