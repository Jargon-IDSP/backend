import { Hono } from "hono";
import { chat } from "../controllers/chatController";

export const chatRoute = new Hono().get("/", chat);
