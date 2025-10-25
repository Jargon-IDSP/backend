import type { Context } from "hono";
import { PrismaClient } from "@prisma/client";

import { prisma } from '../lib/prisma';

export const profile = async (c: Context) => {
  const user = c.get("user");
  
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      username: true,
      language: true,     
      industryId: true, 
      score: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  if (!dbUser) {
    return c.json({ error: "User not found in database" }, 404);
  }
  
  return c.json({ 
    message: "This is the PROFILE page",
    user: dbUser
  }, 200);
};