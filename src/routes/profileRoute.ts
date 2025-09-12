import { Hono } from "hono";
import { profile } from "../controllers/profileController";

export const profileRoute = new Hono().get("/", profile);
