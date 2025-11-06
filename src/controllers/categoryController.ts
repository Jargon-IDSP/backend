import type { Context } from "hono";
import { prisma } from "../lib/prisma";

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
      prisma.document.count({ where: { categoryId } }),
      prisma.customFlashcard.count({ where: { categoryId } }),
      prisma.customQuestion.count({ where: { categoryId } }),
      prisma.customQuiz.count({ where: { categoryId } }),
    ]);

    const totalItems = documentCount + flashcardCount + questionCount + quizCount;

    if (totalItems > 0) {
      return c.json(
        {
          success: false,
          error: `Cannot delete category with ${totalItems} item(s). Please move or delete items first.`,
        },
        400
      );
    }

    // Delete the category
    await prisma.category.delete({
      where: { id: categoryId },
    });

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
