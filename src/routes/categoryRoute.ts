import { Hono } from "hono";
import {
  getCategories,
  createCategory,
  deleteCategory,
} from "../controllers/categoryController";
import { authMiddleware } from "../middleware/authMiddleware";

const categoryRoute = new Hono();

categoryRoute.use("*", authMiddleware);

// Get all categories (default + custom)
categoryRoute.get("/", getCategories);

// Create custom category
categoryRoute.post("/", createCategory);

// Delete custom category
categoryRoute.delete("/:id", deleteCategory);

export default categoryRoute;
