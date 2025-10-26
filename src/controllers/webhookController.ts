import type { Context } from "hono";
import { PrismaClient } from "@prisma/client";
import { Webhook } from "svix";

import { prisma } from '../lib/prisma';

interface ClerkUserData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  created_at: number;
  updated_at: number;
}

export const handleClerkWebhook = async (c: Context) => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    console.log(`Webhook received (${environment})`);
    
    // Validate webhook secret
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
    if (!WEBHOOK_SECRET) {
      console.error("CLERK_WEBHOOK_SECRET not configured");
      return c.json({ error: "Webhook secret not configured" }, 500);
    }

    // Get required headers
    const svix_id = c.req.header("svix-id");
    const svix_timestamp = c.req.header("svix-timestamp");
    const svix_signature = c.req.header("svix-signature");

    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.error("Missing svix headers");
      return c.json({ error: "Missing svix headers" }, 400);
    }

    // Verify webhook signature
    const body = await c.req.text();
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: any;
    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      });
      console.log("Webhook signature verified");
    } catch (err) {
      console.error("Invalid webhook signature:", err);
      return c.json({ error: "Invalid webhook signature" }, 400);
    }

    // Process webhook event
    const eventType = evt.type;
    console.log(`Processing: ${eventType}`);

    switch (eventType) {
      case "user.created":
        await handleUserCreated(evt.data);
        break;
      case "user.updated":
        await handleUserUpdated(evt.data);
        break;
      case "user.deleted":
        await handleUserDeleted(evt.data);
        break;
      default:
        console.log(`Unhandled event: ${eventType}`);
    }

    console.log("Webhook processed successfully");
    return c.json({ success: true });

  } catch (error) {
    console.error("Webhook error:", error);
    return c.json({ 
      error: "Webhook processing failed", 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
};

async function handleUserCreated(userData: ClerkUserData) {
  try {
    console.log(`Creating user: ${userData.id}`);

    // Get primary email
    const primaryEmail = userData.email_addresses?.find(
      (email) => email.id === userData.primary_email_address_id
    )?.email_address;

    if (!primaryEmail) {
      console.log(`Skipping user ${userData.id}: No primary email`);
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userData.id },
    });

    if (existingUser) {
      console.log(`User ${userData.id} already exists`);
      return;
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        id: userData.id,
        email: primaryEmail,
        firstName: userData.first_name || null,
        lastName: userData.last_name || null,
        username: userData.username || null,
        score: 0,
        createdAt: new Date(userData.created_at),
        updatedAt: new Date(userData.updated_at),
      },
    });

    console.log(`Created user: ${primaryEmail} (${userData.id})`);

  } catch (error) {
    console.error(`Error creating user ${userData.id}:`, error);
    throw error;
  }
}

async function handleUserUpdated(userData: ClerkUserData) {
  try {
    console.log(`Updating user: ${userData.id}`);

    const primaryEmail = userData.email_addresses?.find(
      (email) => email.id === userData.primary_email_address_id
    )?.email_address;

    if (!primaryEmail) {
      console.log(`Skipping user ${userData.id}: No primary email`);
      return;
    }

    await prisma.user.update({
      where: { id: userData.id },
      data: {
        email: primaryEmail,
        firstName: userData.first_name || null,
        lastName: userData.last_name || null,
        username: userData.username || null,
        updatedAt: new Date(userData.updated_at),
      },
    });

    console.log(`Updated user: ${primaryEmail} (${userData.id})`);

  } catch (error) {
    console.error(`Error updating user ${userData.id}:`, error);
  }
}

async function handleUserDeleted(userData: ClerkUserData) {
  try {
    console.log(`Deleting user: ${userData.id}`);

    await prisma.user.delete({
      where: { id: userData.id },
    });

    console.log(`Deleted user: ${userData.id}`);

  } catch (error) {
    console.error(`Error deleting user ${userData.id}:`, error);
  }
}