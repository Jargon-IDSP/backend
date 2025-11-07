import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

import { prisma } from '../lib/prisma';

interface ClerkUser {
  id: string;
  emailAddresses: Array<{
    emailAddress: string;
    id: string;
  }>;
  primaryEmailAddressId: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  createdAt: number;
  updatedAt: number;
}

async function migrateUsersFromClerk() {
  try {
    console.log("Starting user migration from Clerk...");

    if (!process.env.CLERK_SECRET_KEY) {
      throw new Error("CLERK_SECRET_KEY environment variable is not set!");
    }

    console.log("Environment validated");

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    console.log("Fetching users from Clerk...");
    const clerkUsers = await clerk.users.getUserList({ limit: 500 });
    console.log(`Found ${clerkUsers.data.length} users in Clerk`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const clerkUser of clerkUsers.data) {
      try {
        const primaryEmail = clerkUser.emailAddresses.find(
          (email) => email.id === clerkUser.primaryEmailAddressId
        )?.emailAddress;

        if (!primaryEmail) {
          console.log(`Skipping user ${clerkUser.id}: No primary email`);
          skippedCount++;
          continue;
        }

        const existingUser = await prisma.user.findUnique({
          where: { id: clerkUser.id },
        });

        if (existingUser) {
          // Update existing user while preserving score and language
          await prisma.user.update({
            where: { id: clerkUser.id },
            data: {
              email: primaryEmail,
              firstName: clerkUser.firstName || existingUser.firstName,
              lastName: clerkUser.lastName || existingUser.lastName,
              username: clerkUser.username || existingUser.username,
              // Preserve score and language - don't update them
              updatedAt: new Date(clerkUser.updatedAt),
            },
          });
          console.log(`Updated user (preserved score: ${existingUser.score}, language: ${existingUser.language}): ${primaryEmail}`);
          skippedCount++;
          continue;
        }

        // Generate random score between 0 and 5000 for new users
        const randomScore = Math.floor(Math.random() * 5001);

        await prisma.user.create({
          data: {
            id: clerkUser.id,
            email: primaryEmail,
            firstName: clerkUser.firstName || null,
            lastName: clerkUser.lastName || null,
            username: clerkUser.username || null,
            score: randomScore,
            createdAt: new Date(clerkUser.createdAt),
            updatedAt: new Date(clerkUser.updatedAt),
          },
        });

        console.log(`Migrated new user: ${primaryEmail} (${clerkUser.id}) with score: ${randomScore}`);
        migratedCount++;

      } catch (error) {
        console.error(`Error migrating user ${clerkUser.id}:`, error);
        errorCount++;
      }
    }

    if (clerkUsers.totalCount > clerkUsers.data.length) {
      console.log(`\nNote: There are ${clerkUsers.totalCount} total users in Clerk.`);
      console.log("This script only migrated the first 500 users.");
    }

  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrateUsers.ts')) {
  migrateUsersFromClerk()
    .then(() => {
      console.log("Migration completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

export { migrateUsersFromClerk };