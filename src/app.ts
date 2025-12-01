import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { chatRoute } from "./routes/chatRoute";
import { profileRoute } from "./routes/profileRoute";
import { documentRoute } from "./routes/documentRoute";
import webhookRoute from "./routes/webhookRoute";
import { leaderboardRoute } from "./routes/leaderboardRoute";
import { learningRoute } from "./routes/learningRoute";
import { ocrRoute } from "./routes/ocrRoute";
import quizRoute from "./routes/quizRoute";
import prebuiltQuizRoute from "./routes/prebuiltQuizRoute";
import friendshipRoute from "./routes/friendshipRoute";
import quizShareRoute from "./routes/quizShareRoute";
import weeklyStatsRoute from "./routes/weeklyStatsRoute";
import categoryRoute from "./routes/categoryRoute";
import lessonRequestRoute from "./routes/lessonRequestRoute";
import { notificationRoute } from "./routes/notificationRoute";
import { avatarRoute } from "./routes/avatarRoute";
import { translateRoute } from "./routes/translateRoute";
import { connectRedis } from "./lib/redis";
import userRoutes from "./routes/users";

import redisClient from "./lib/redis";

export const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://frontend-cl3c.onrender.com",
      "https://www.jargon-app.ca",
      "https://backend-84zo.onrender.com",
    ],
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length", "Content-Type"],
    maxAge: 600,
  })
);

// Redis connection is now handled in index.ts before server starts

// Health check endpoint (useful for monitoring)
app.get("/", (c) =>
  c.json({
    message: "It's working!",
    status: "ok",
  })
);
app.get("/health", (c) => c.json({ status: "ok" }));

// Add this temporary endpoint
app.get("/admin/clear-cache", async (c) => {
  try {
    await redisClient.flushAll();
    return c.json({ success: true, message: "Cache cleared successfully" });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Routes
app.route("/api", userRoutes);
app.route("/chat", chatRoute);
app.route("/profile", profileRoute);
app.route("/avatar", avatarRoute);
app.route("/documents", documentRoute);
app.route("/webhooks", webhookRoute);
app.route("/leaderboard", leaderboardRoute);
app.route("/learning", learningRoute);
app.route("/ocr", ocrRoute);
app.route("/quiz", quizRoute);
app.route("/prebuilt-quizzes", prebuiltQuizRoute);
app.route("/friendships", friendshipRoute);
app.route("/quiz-shares", quizShareRoute);
app.route("/weekly-tracking", weeklyStatsRoute);
app.route("/categories", categoryRoute);
app.route("/notifications", notificationRoute);
app.route("/lesson-requests", lessonRequestRoute);
app.route("/api", translateRoute);

// 404 handler
app.notFound((c) => c.json({ error: "Not Found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});
