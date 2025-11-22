import { Hono } from "hono";
import { cacheMiddleware } from "../middleware/cache";
import { authMiddleware } from "../middleware/authMiddleware";
import { UserService } from "../services/userService";
import { prisma } from "../lib/prisma";

const app = new Hono();
const userService = new UserService();

// Apply auth middleware to all routes
app.use("*", authMiddleware);

// Using middleware for automatic caching
app.get("/users", cacheMiddleware(300), async (c) => {
  return c.json({ message: "Users endpoint - implement with Redis if needed" });
});

// Update user privacy settings (MUST come before /users/:id route)
app.put("/users/privacy", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { defaultPrivacy } = await c.req.json();

    // Validate the privacy setting
    const validSettings = ["PRIVATE", "FRIENDS", "PUBLIC"];
    if (!validSettings.includes(defaultPrivacy)) {
      return c.json({ error: "Invalid privacy setting" }, 400);
    }

    console.log(`🔒 Updating privacy for user ${user.id} to ${defaultPrivacy}`);

    // Check current value first
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { defaultPrivacy: true },
    });
    console.log(`📊 Current privacy setting: ${currentUser?.defaultPrivacy}`);

    // Update the user's default privacy
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { defaultPrivacy },
      select: {
        id: true,
        defaultPrivacy: true,
      },
    });

    console.log(`✅ User privacy updated from ${currentUser?.defaultPrivacy} to ${updatedUser.defaultPrivacy}`);

    // Note: We no longer update CustomQuiz.visibility as it has been removed from the schema.
    // Privacy is now controlled solely by User.defaultPrivacy, which is checked at query time.
    // PRIVATE -> use CustomQuizShare table for access control
    // FRIENDS -> all mutual friends can see (checked via Follow table)
    // PUBLIC -> everyone can see

    // Invalidate user cache
    await userService.invalidateUserCache(user.id);

    return c.json({
      success: true,
      defaultPrivacy: updatedUser.defaultPrivacy,
    });
  } catch (error) {
    console.error("Error updating privacy settings:", error);
    return c.json({ error: "Failed to update privacy settings" }, 500);
  }
});

// Get user by ID - no caching for friend profiles
app.get("/users/:id", async (c) => {
  const userId = c.req.param("id");

  // Query database directly without caching
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      score: true,
      industryId: true,
      defaultPrivacy: true,
      linkedinUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      indeedUrl: true,
      createdAt: true,
      avatar: {
        select: {
          body: true,
          bodyColor: true,
          expression: true,
          hair: true,
          headwear: true,
          eyewear: true,
          facial: true,
          clothing: true,
          shoes: true,
          accessories: true,
        },
      },
    },
  });

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
