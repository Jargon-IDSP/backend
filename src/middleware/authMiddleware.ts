import { verifyToken, createClerkClient } from "@clerk/backend";
import type { Context, Next } from "hono";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
      // console.log(`Updated user: ${primaryEmail} (${clerkUser.id})`);
    } else {
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
      // console.log(`Created user: ${primaryEmail} (${clerkUser.id})`);
    }
  } catch (error) {
    console.error(`Error syncing user ${clerkUser.id}:`, error);
  }
}

export const authMiddleware = async (c: Context, next: Next) => {

    if (c.req.method === "OPTIONS") {
    return next();
  }

  // console.log("🔒 AUTH MIDDLEWARE CALLED");
  // console.log("Path:", c.req.path);
  // console.log("Method:", c.req.method);
  // console.log("Headers:", c.req.header("Authorization") ? "Present" : "Missing");
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      console.error("CLERK_SECRET_KEY not configured");
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

    // console.log("Verifying token...");
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    if (!payload) {
      return c.json({ error: "Invalid token" }, 401);
    }

    // console.log("Token verified for user:", payload.sub);

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    const clerkUser = await clerk.users.getUser(payload.sub);

    // console.log("User data:", {
    //   id: clerkUser.id,
    //   email: clerkUser.primaryEmailAddress?.emailAddress,
    //   name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim()
    // });

    await syncUserToDatabase(clerkUser);

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
    // Only log real errors, not expected "not logged in" scenarios
    const isExpectedError = error instanceof Error && (
      error.message.includes('Invalid JWT form') ||
      error.message.includes('token-invalid')
    );
    
    if (!isExpectedError) {
      console.error("Auth middleware error:", error);
    }
    
    return c.json({ 
      error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, 401);
  }
};