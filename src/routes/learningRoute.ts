import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";

export const learningRoute = new Hono()
  .use("*", authMiddleware)
  // Existing learning paths - level-based
  .get("/existing/levels", (c) => {
    // Get available levels for existing content
    return c.json({ page: "existing-levels" });
  })
  .get("/existing/levels/:level/terms", (c) => {
    const level = c.req.param("level");
    return c.json({ page: "existing-terms", level });
  })
  .get("/existing/levels/:level/quiz", (c) => {
    const level = c.req.param("level");
    return c.json({ page: "existing-quiz", level });
  })
  .get("/existing/levels/:level/quiz/questions", (c) => {
    const level = c.req.param("level");
    return c.json({ page: "existing-quiz-questions", level });
  })
  // Custom learning paths
  .get("/custom/practice-questions", (c) => {
    return c.json({ page: "custom-practice-questions" });
  })
  .get("/custom/practice-questions/:id", (c) => {
    return c.json({ page: "custom-practice-questions-detail", id: c.req.param("id") });
  })
  .get("/custom/practice-terms", (c) => {
    return c.json({ page: "custom-practice-terms" });
  })
  .get("/custom/practice-terms/:id", (c) => {
    return c.json({ page: "custom-practice-terms-detail", id: c.req.param("id") });
  })
  .get("/custom/quiz/:quizNumber", (c) => {
    const quizNumber = c.req.param("quizNumber");
    return c.json({ page: "custom-quiz", quizNumber });
  });
