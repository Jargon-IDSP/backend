import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import axios from "axios";

import { homeRoute } from "./routes/homeRoute";
import { chatRoute } from "./routes/chatRoute";
import { helpRoute } from "./routes/helpRoute";
import { profileRoute } from "./routes/profileRoute";
import { flashcardRoute } from "./routes/flashcardRoute";
import { questionRoute } from "./routes/questionRoute";
import { initializeCache } from "./controllers/flashcardController";
import { documentRoute } from "./routes/documentRoute";

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

app.route("/", homeRoute);
app.route("/chat", chatRoute);
app.route("/help", helpRoute);
app.route("/profile", profileRoute);
app.route("/flashcards", flashcardRoute);
app.route("/questions", questionRoute);
app.route("/documents", documentRoute);

// Add this test endpoint to your routes
app.post("/test-nanonets-url", async (c) => {
  try {
    const apiKey = process.env.NANONETS_API_KEY!;
    const modelId = process.env.NANONETS_MODEL_ID!;

    console.log("Testing Nanonets with public image URL...");

    const response = await axios.post(
      `https://app.nanonets.com/api/v2/OCR/Model/${modelId}/LabelFile/`,
      "urls=https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400",
      {
        auth: {
          username: apiKey,
          password: "",
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        validateStatus: () => true,
      }
    );

    console.log("Nanonets Response:", response.status, response.data);

    return c.json({
      status: response.status,
      data: response.data,
    });
  } catch (error: any) {
    console.error("Error:", error);
    return c.json(
      {
        error: error.message,
        response: error.response?.data,
      },
      500
    );
  }
});

await initializeCache();
