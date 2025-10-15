import { Hono } from "hono";
import { handleClerkWebhook } from "../controllers/webhookController";

const webhookRoute = new Hono();

// Clerk webhook endpoint
webhookRoute.post("/clerk", handleClerkWebhook);

export default webhookRoute;
