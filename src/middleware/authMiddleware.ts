import { verifyToken, createClerkClient } from "@clerk/backend";
import type { Context, Next } from "hono";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function syncUserToDatabase(clerkUser: any) {
  try {
    const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress;
    
    if (!primaryEmail) {
      console.log(`Skipping sync for user ${clerkUser.id}: No primary email`);
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: clerkUser.id },
    });

    if (existingUser) {
      // Update existing user
      await prisma.user.update({
        where: { id: clerkUser.id },
        data: {
          email: primaryEmail,
          firstName: clerkUser.firstName || null,
          lastName: clerkUser.lastName || null,
          username: clerkUser.username || null,
          updatedAt: new Date(),
        },
      });
      console.log(`Updated user: ${primaryEmail} (${clerkUser.id})`);
    } else {
      // Create new user
      await prisma.user.create({
        data: {
          id: clerkUser.id,
          email: primaryEmail,
          firstName: clerkUser.firstName || null,
          lastName: clerkUser.lastName || null,
          username: clerkUser.username || null,
          score: 0,
          createdAt: new Date(clerkUser.createdAt),
          updatedAt: new Date(clerkUser.updatedAt),
        },
      });
      console.log(`Created user: ${primaryEmail} (${clerkUser.id})`);
    }
  } catch (error) {
    console.error(`Error syncing user ${clerkUser.id}:`, error);
    // Don't throw error to avoid breaking authentication
  }
}

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    // Validate environment
    if (!process.env.CLERK_SECRET_KEY) {
      console.error("CLERK_SECRET_KEY not configured");
      return c.json({ error: "Server configuration error: Missing Clerk secret key" }, 500);
    }

    // Get and validate authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ error: "No authorization header provided" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return c.json({ error: "No token provided" }, 401);
    }

    // Verify token
    console.log("Verifying token...");
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    if (!payload) {
      return c.json({ error: "Invalid token" }, 401);
    }

    console.log("Token verified for user:", payload.sub);

    // Fetch user data from Clerk
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    const clerkUser = await clerk.users.getUser(payload.sub);
    
    console.log("User data:", {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim()
    });

    // Sync user to database
    await syncUserToDatabase(clerkUser);

    // Set user context
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
    return c.json({ 
      error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, 401);
  }
};