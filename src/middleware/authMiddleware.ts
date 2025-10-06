import { verifyToken, createClerkClient } from "@clerk/backend";
import type { Context, Next } from "hono";

// Extend Hono's Context to include user information
declare module "hono" {
  interface ContextVariableMap {
    user: {
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      username?: string;
    };
  }
}

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      console.error("CLERK_SECRET_KEY environment variable is not set!");
      return c.json({ error: "Server configuration error: Missing Clerk secret key" }, 500);
    }

    const authHeader = c.req.header("Authorization");
    
    if (!authHeader) {
      return c.json({ error: "No authorization header provided" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    
    if (!token) {
      return c.json({ error: "No token provided" }, 401);
    }

    console.log("Attempting to verify token...");

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    if (!payload) {
      return c.json({ error: "Invalid token" }, 401);
    }

    console.log("Token verified successfully for user:", payload.sub);
    console.log("Full JWT payload:", JSON.stringify(payload, null, 2));

    // Create Clerk client to fetch complete user data
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    
    // Fetch the complete user data from Clerk
    const clerkUser = await clerk.users.getUser(payload.sub);
    
    console.log("Complete user data from Clerk:", JSON.stringify({
      id: clerkUser.id,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      username: clerkUser.username,
      email: clerkUser.primaryEmailAddress?.emailAddress
    }, null, 2));

    const user = {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || "",
      firstName: clerkUser.firstName || "",
      lastName: clerkUser.lastName || "",
      username: clerkUser.username || "",
    };

    c.set("user", user);

    await next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return c.json({ error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}` }, 401);
  }
};
