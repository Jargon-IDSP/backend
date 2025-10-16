import { Hono } from "hono";
import { getRandomQuestion } from "../controllers/questionController";

export const questionRoute = new Hono();

questionRoute.get("/random", getRandomQuestion);
