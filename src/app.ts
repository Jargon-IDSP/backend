import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import { homeRoute } from "./routes/homeRoute";
import { chatRoute } from "./routes/chatRoute";
import { helpRoute } from "./routes/helpRoute";
import { profileRoute } from "./routes/profileRoute";
import { flashcardRoute } from "./routes/flashcardRoute";
import { questionRoute } from "./routes/questionRoute";
import { initializeCache } from "./controllers/flashcardController";

export const app = new Hono();

app.use("*", logger());
app.use(
  "/*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:8080",
      "https://frontend-cl3c.onrender.com/",
      "https://backend-84zo.onrender.com/",
    ],
    credentials: true,
  })
);

app.route("/", homeRoute);
app.route("/chat", chatRoute);
app.route("/help", helpRoute);
app.route("/profile", profileRoute);
app.route("/flashcards", flashcardRoute);
app.route("/questions", questionRoute);

await initializeCache();
