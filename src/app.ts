import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import { homeRoute } from "./routes/homeRoute";
import { chatRoute } from "./routes/chatRoute";
import { helpRoute } from "./routes/helpRoute";
import { profileRoute } from "./routes/profileRoute";

export const app = new Hono();

app.use("*", logger());
app.use("/*", cors());

app.route("/", homeRoute);
app.route("/chat", chatRoute);
app.route("/help", helpRoute);
app.route("/profile", profileRoute);
