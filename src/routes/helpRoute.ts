import { Hono } from "hono";
import { help } from "../controllers/helpController";

export const helpRoute = new Hono().get("/", help);
