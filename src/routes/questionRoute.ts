import { Hono } from "hono";
import { getRandomQuestion } from "../controllers/questionController";

export const questionRoute = new Hono();

// Get a single random question with multiple choice options
questionRoute.get("/random", getRandomQuestion);
