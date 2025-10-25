import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { chatRoute } from "./routes/chatRoute";
import { helpRoute } from "./routes/helpRoute";
import { profileRoute } from "./routes/profileRoute";
import { initializeCache } from "./controllers/flashcardController";
import { documentRoute } from "./routes/documentRoute";
import webhookRoute from "./routes/webhookRoute";
import { leaderboardRoute } from "./routes/leaderboardRoute";
import { learningRoute } from "./routes/learningRoute";
import { ocrRoute } from "./routes/ocrRoute";
import quizRoute from "./routes/quizRoute";
import friendshipRoute from "./routes/friendshipRoute";

export const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://frontend-cl3c.onrender.com",
      "https://backend-84zo.onrender.com",
    ],
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.route("/chat", chatRoute);
app.route("/help", helpRoute);
app.route("/profile", profileRoute);
app.route("/documents", documentRoute);
app.route("/webhooks", webhookRoute);
app.route("/leaderboard", leaderboardRoute);
app.route("/learning", learningRoute); 
app.route("/ocr", ocrRoute);
app.route("/quiz", quizRoute);
app.route("/friendships", friendshipRoute);


await initializeCache();