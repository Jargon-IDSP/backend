import type { Context } from "hono";
import { prisma } from "../lib/prisma";
import redisClient, { connectRedis } from "../lib/redis";

// Helper function to invalidate cache by pattern
const invalidateCachePattern = async (pattern: string): Promise<void> => {
  try {
    if (!redisClient.isOpen) {
      await connectRedis();
    }
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error(`Error invalidating cache pattern ${pattern}:`, error);
  }
};

/**
 * Helper function to check and delete empty "Uncategorized" category for a user
 * This is called after moving documents out of "Uncategorized"
 */
export const cleanupUncategorizedCategory = async (userId: string): Promise<void> => {
  try {
    // Find "Uncategorized" category for this user
    const uncategorizedCategory = await prisma.category.findFirst({
      where: {
        name: "Uncategorized",
        userId,
        isDefault: false,
      },
    });

    if (!uncategorizedCategory) {
      return; // No "Uncategorized" category exists, nothing to clean up
    }

    const uncategorizedCategoryId = uncategorizedCategory.id;

    // Check if category has any items (documents, flashcards, questions, quizzes)
    const [documentCount, flashcardCount, questionCount, quizCount] = await Promise.all([
      prisma.document.count({ where: { categoryId: uncategorizedCategoryId, userId } }),
      prisma.customFlashcard.count({ where: { categoryId: uncategorizedCategoryId, userId } }),
      prisma.customQuestion.count({ where: { categoryId: uncategorizedCategoryId, userId } }),
      prisma.customQuiz.count({ where: { categoryId: uncategorizedCategoryId, userId } }),
    ]);

    const totalItems = documentCount + flashcardCount + questionCount + quizCount;

    // If no items, delete the "Uncategorized" category
    if (totalItems === 0) {
      await prisma.category.delete({
        where: { id: uncategorizedCategoryId },
      });
      console.log(`🗑️  Auto-deleted empty "Uncategorized" category (ID: ${uncategorizedCategoryId}) for user ${userId}`);
      
      // Invalidate categories cache
      await invalidateCachePattern(`categories:all:${userId}`);
    }
  } catch (error) {
    console.error("Error cleaning up Uncategorized category:", error);
    // Don't throw - this is a cleanup operation, shouldn't fail the main operation
  }
};

/**
 * Get all categories for a user
 * Returns both default categories (available to all) and user's custom categories
 */
export const getCategories = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;

    // Get default categories (available to everyone)
    const defaultCategories = await prisma.category.findMany({
      where: {
        isDefault: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    // Get user's custom categories
    const customCategories = await prisma.category.findMany({
      where: {
        userId,
        isDefault: false,
      },
      orderBy: {
        name: "asc",
      },
    });

    return c.json({
      success: true,
      data: {
        default: defaultCategories,
        custom: customCategories,
      },
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch categories",
      },
      500
    );
  }
};

/**
 * Create a custom category for the user
 */
export const createCategory = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;
    const { name } = await c.req.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: "Category name is required",
        },
        400
      );
    }

    const trimmedName = name.trim();

    // Check if user already has a category with this name
    const existingCategory = await prisma.category.findUnique({
      where: {
        name_userId: {
          name: trimmedName,
          userId,
        },
      },
    });

    if (existingCategory) {
      return c.json(
        {
          success: false,
          error: "You already have a category with this name",
        },
        400
      );
    }

    // Create the custom category
    const category = await prisma.category.create({
      data: {
        name: trimmedName,
        userId,
        isDefault: false,
      },
    });

    // Invalidate categories cache
    await invalidateCachePattern(`categories:all:${userId}`);

    return c.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    return c.json(
      {
        success: false,
        error: "Failed to create category",
      },
      500
    );
  }
};

/**
 * Delete a custom category
 * Only the owner can delete their custom categories
 * Default categories cannot be deleted
 */
export const deleteCategory = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;
    const categoryId = parseInt(c.req.param("id"));

    if (isNaN(categoryId)) {
      return c.json(
        {
          success: false,
          error: "Invalid category ID",
        },
        400
      );
    }

    // Get the category
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return c.json(
        {
          success: false,
          error: "Category not found",
        },
        404
      );
    }

    // Check if it's a default category
    if (category.isDefault) {
      return c.json(
        {
          success: false,
          error: "Cannot delete default categories",
        },
        403
      );
    }

    // Check if user owns this category
    if (category.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "You can only delete your own categories",
        },
        403
      );
    }

    // Check if category has any items (documents, flashcards, questions, quizzes)
    const [documentCount, flashcardCount, questionCount, quizCount] = await Promise.all([
      prisma.document.count({ where: { categoryId, userId } }),
      prisma.customFlashcard.count({ where: { categoryId, userId } }),
      prisma.customQuestion.count({ where: { categoryId, userId } }),
      prisma.customQuiz.count({ where: { categoryId, userId } }),
    ]);

    const totalItems = documentCount + flashcardCount + questionCount + quizCount;

    if (totalItems > 0) {
      // Find or create "Uncategorized" category for this user
      let uncategorizedCategory = await prisma.category.findFirst({
        where: {
          name: "Uncategorized",
          userId,
          isDefault: false,
        },
      });

      if (!uncategorizedCategory) {
        // Create "Uncategorized" category if it doesn't exist
        uncategorizedCategory = await prisma.category.create({
          data: {
            name: "Uncategorized",
            userId,
            isDefault: false,
          },
        });
        console.log(`📁 Created "Uncategorized" category (ID: ${uncategorizedCategory.id}) for user ${userId}`);
      }

      const uncategorizedCategoryId = uncategorizedCategory.id;

      // Move all items to "Uncategorized" category in a transaction
      await prisma.$transaction([
        // Move documents
        prisma.document.updateMany({
          where: { categoryId, userId },
          data: { categoryId: uncategorizedCategoryId },
        }),
        // Move flashcards
        prisma.customFlashcard.updateMany({
          where: { categoryId, userId },
          data: { categoryId: uncategorizedCategoryId },
        }),
        // Move questions
        prisma.customQuestion.updateMany({
          where: { categoryId, userId },
          data: { categoryId: uncategorizedCategoryId },
        }),
        // Move quizzes
        prisma.customQuiz.updateMany({
          where: { categoryId, userId },
          data: { categoryId: uncategorizedCategoryId },
        }),
        // Delete the category
        prisma.category.delete({
          where: { id: categoryId },
        }),
      ]);

      console.log(`✅ Moved ${totalItems} item(s) from category ${categoryId} to "Uncategorized" (${uncategorizedCategoryId})`);

      // Invalidate caches for both old and new categories
      await Promise.all([
        invalidateCachePattern(`categories:all:${userId}`),
        invalidateCachePattern(`documents:category:${userId}:${categoryId}`),
        invalidateCachePattern(`documents:category:${userId}:${uncategorizedCategoryId}`),
        invalidateCachePattern(`documents:user:${userId}`),
      ]);

      return c.json({
        success: true,
        message: `Category deleted. ${totalItems} item(s) moved to "Uncategorized" folder.`,
        movedItemsCount: totalItems,
      });
    }

    // No items in category, safe to delete
    await prisma.category.delete({
      where: { id: categoryId },
    });

    console.log(`✅ Deleted empty category ${categoryId} (${category.name})`);

    // Invalidate categories cache
    await invalidateCachePattern(`categories:all:${userId}`);

    return c.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    return c.json(
      {
        success: false,
        error: "Failed to delete category",
      },
      500
    );
  }
};
