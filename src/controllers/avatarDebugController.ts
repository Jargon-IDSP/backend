import type { Context } from "hono";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../lib/s3";
import { prisma } from "../lib/prisma";

const BUCKET_NAME = process.env.S3_BUCKET!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Debug endpoint to check avatar PNG status
 * GET /api/avatars/debug/:userId
 */
export const debugAvatar = async (c: Context) => {
  try {
    const userId = c.req.param("userId");
    const currentUser = c.get("user");

    if (!currentUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`🔍 Debug request for user ${userId}`);

    // Fetch user's avatar from database
    const userAvatar = await prisma.userAvatar.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          },
        },
      },
    });

    if (!userAvatar) {
      return c.json({
        success: false,
        error: `No avatar found in database for user ${userId}`,
      });
    }

    // Check if file exists in R2/S3
    const key = `avatars/${userId}.png`;
    let fileExists = false;
    let fileMetadata: any = null;

    try {
      const headCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      const response = await s3.send(headCommand);
      fileExists = true;
      fileMetadata = {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        cacheControl: response.CacheControl,
        etag: response.ETag,
      };
      console.log(`✅ File exists in R2: ${key}`);
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        console.log(`❌ File NOT found in R2: ${key}`);
        fileExists = false;
      } else {
        console.error(`⚠️ Error checking file existence:`, error);
        throw error;
      }
    }

    // Construct expected public URLs
    const publicUrlWithR2 = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `${process.env.S3_ENDPOINT}/${BUCKET_NAME}/${key}`;

    return c.json({
      success: true,
      userId,
      username: userAvatar.user.username,
      database: {
        avatarImageUrl: userAvatar.avatarImageUrl,
        body: userAvatar.body,
        bodyColor: userAvatar.bodyColor,
        expression: userAvatar.expression,
        hair: userAvatar.hair,
        headwear: userAvatar.headwear,
        eyewear: userAvatar.eyewear,
        facial: userAvatar.facial,
        clothing: userAvatar.clothing,
        shoes: userAvatar.shoes,
        accessories: userAvatar.accessories,
      },
      r2: {
        bucketName: BUCKET_NAME,
        key,
        fileExists,
        fileMetadata,
        expectedPublicUrl: publicUrlWithR2,
        r2PublicUrl: R2_PUBLIC_URL || "NOT_CONFIGURED",
      },
      environment: {
        hasCloudflareZoneId: !!process.env.CLOUDFLARE_ZONE_ID,
        hasCloudflareApiToken: !!process.env.CLOUDFLARE_API_TOKEN,
        frontendUrl: process.env.FRONTEND_URL,
      },
    });
  } catch (error) {
    console.error("❌ Debug endpoint error:", error);
    return c.json(
      {
        error: "Debug check failed",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};

/**
 * Test endpoint to regenerate avatar PNG and return detailed info
 * POST /api/avatars/test-generation
 */
export const testGeneration = async (c: Context) => {
  try {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`🧪 Test generation requested for user ${user.id}`);

    // Import generateAvatarPng dynamically to avoid circular dependency
    const { generateAvatarPng } = await import("../lib/avatarPngGenerator");

    const startTime = Date.now();
    const imageUrl = await generateAvatarPng(user.id);
    const duration = Date.now() - startTime;

    // Fetch updated avatar data
    const userAvatar = await prisma.userAvatar.findUnique({
      where: { userId: user.id },
    });

    const key = `avatars/${user.id}.png`;

    return c.json({
      success: true,
      message: "Avatar PNG generated successfully",
      imageUrl,
      duration: `${duration}ms`,
      directLinks: {
        withTimestamp: imageUrl,
        withoutTimestamp: imageUrl.split("?")[0],
        r2Key: key,
      },
      database: {
        avatarImageUrl: userAvatar?.avatarImageUrl,
      },
      instructions:
        "Try opening these URLs in your browser:\n1. Copy 'withTimestamp' URL and paste in browser\n2. Check Cloudflare R2 dashboard for the file\n3. Clear browser cache if needed",
    });
  } catch (error) {
    console.error("❌ Test generation error:", error);
    return c.json(
      {
        error: "Test generation failed",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};
