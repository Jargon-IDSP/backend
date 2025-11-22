import type { Context } from "hono";
import { generateAvatarPng } from "../lib/avatarPngGenerator";

/**
 * Generate PNG image from user's avatar
 * POST /api/avatars/generate-png
 */
export const generatePng = async (c: Context) => {
  try {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`🎨 PNG generation requested for user ${user.id}`);

    // Generate the PNG asynchronously
    const imageUrl = await generateAvatarPng(user.id);

    return c.json({
      success: true,
      imageUrl,
      message: "Avatar PNG generated successfully",
    });
  } catch (error) {
    console.error("PNG generation error:", error);
    return c.json(
      {
        error: "Failed to generate avatar PNG",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};
