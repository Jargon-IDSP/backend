import puppeteer from "puppeteer";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./s3";
import { prisma } from "./prisma";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const BUCKET_NAME = process.env.S3_BUCKET!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g., "https://pub-xxxxx.r2.dev" or custom domain

/**
 * Generate a PNG image from user's avatar configuration
 * @param userId - User ID
 * @returns URL of uploaded PNG image
 */
export async function generateAvatarPng(userId: string): Promise<string> {
  console.log(`🎨 Starting avatar PNG generation for user ${userId}`);

  // Fetch user's avatar configuration from database
  const userAvatar = await prisma.userAvatar.findUnique({
    where: { userId },
  });

  if (!userAvatar) {
    throw new Error(`No avatar found for user ${userId}`);
  }

  // Build avatar config URL params for rendering
  const params = new URLSearchParams({
    body: userAvatar.body || "body-1",
    bodyColor: userAvatar.bodyColor || "#FFB6C1",
    expression: userAvatar.expression || "",
    hair: userAvatar.hair || "",
    headwear: userAvatar.headwear || "",
    eyewear: userAvatar.eyewear || "",
    facial: userAvatar.facial || "",
    clothing: userAvatar.clothing || "",
    shoes: userAvatar.shoes || "",
    accessories: userAvatar.accessories || "[]",
    renderOnly: "true", // Flag to tell frontend to render without UI
  });

  const avatarUrl = `${FRONTEND_URL}/avatar/render?${params.toString()}`;

  console.log(`📸 Launching Puppeteer to capture avatar at: ${avatarUrl}`);

  let browser;
  try {
    // Launch headless browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Set viewport to match avatar dimensions
    await page.setViewport({ width: 300, height: 360 });

    // Navigate to avatar render page
    await page.goto(avatarUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Wait for avatar to render
    await page.waitForSelector('.AvatarSprite', { timeout: 10000 });

    // Give SVG time to fully render and wait for all fonts to load
    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get the actual bounding box of the avatar (not the container with padding)
    const boundingBox = await page.evaluate(() => {
      const element = document.querySelector('.AvatarSprite');
      if (!element) throw new Error('Avatar element not found');
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    });

    console.log(`📐 Avatar container bounding box:`, boundingBox);

    // Take screenshot using actual element position
    const screenshotBuffer = await page.screenshot({
      type: "png",
      clip: boundingBox,
    });

    console.log(`✅ Screenshot captured (${screenshotBuffer.length} bytes)`);

    // Resize to 200x200 while maintaining aspect ratio (2x retina quality for 100x100 display)
    const resizedBuffer = await sharp(screenshotBuffer)
      .resize(200, 200, {
        fit: "contain",  // Fit entire avatar within 200x200 without cropping
        background: { r: 255, g: 255, b: 255, alpha: 0 }  // Transparent background
      })
      .png({ quality: 90 })
      .toBuffer();

    console.log(`✅ Image resized to 200x200 (${resizedBuffer.length} bytes)`);

    // Upload to R2
    const key = `avatars/${userId}.png`;
    console.log(`📤 Uploading to R2: Bucket="${BUCKET_NAME}", Key="${key}"`);

    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: resizedBuffer,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000", // Cache for 1 year
    });

    await s3.send(uploadCommand);
    console.log(`✅ Upload successful to R2`);

    // Construct public URL with cache-busting timestamp
    const timestamp = Date.now();
    let imageUrl: string;
    if (R2_PUBLIC_URL) {
      // Use configured public URL (e.g., "https://pub-xxxxx.r2.dev" or custom domain)
      imageUrl = `${R2_PUBLIC_URL}/${key}?v=${timestamp}`;
      console.log(`🌐 Using R2_PUBLIC_URL: ${R2_PUBLIC_URL}`);
    } else {
      // Fallback: construct from S3_ENDPOINT (may need adjustment for your setup)
      imageUrl = `${process.env.S3_ENDPOINT}/${BUCKET_NAME}/${key}?v=${timestamp}`;
      console.log(`🌐 Using S3_ENDPOINT fallback: ${process.env.S3_ENDPOINT}`);
    }

    console.log(`✅ Avatar PNG uploaded to R2: ${imageUrl}`);

    // Purge Cloudflare cache for immediate visibility
    if (process.env.CLOUDFLARE_ZONE_ID && process.env.CLOUDFLARE_API_TOKEN) {
      try {
        const baseUrl = imageUrl.split('?')[0]; // Remove query params for cache purge
        console.log(`🔄 Attempting Cloudflare cache purge for: ${baseUrl}`);

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/purge_cache`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              files: [baseUrl]
            })
          }
        );

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Cloudflare cache purged successfully:`, result);
        } else {
          const error = await response.text();
          console.warn(`⚠️ Failed to purge Cloudflare cache (Status ${response.status}): ${error}`);
        }
      } catch (cacheError) {
        console.warn(`⚠️ Cache purge failed (non-critical):`, cacheError);
      }
    } else {
      console.log(`⚠️ Cloudflare cache purge skipped - credentials not configured`);
      console.log(`   - CLOUDFLARE_ZONE_ID: ${process.env.CLOUDFLARE_ZONE_ID ? 'SET' : 'NOT SET'}`);
      console.log(`   - CLOUDFLARE_API_TOKEN: ${process.env.CLOUDFLARE_API_TOKEN ? 'SET' : 'NOT SET'}`);
    }

    // Update database with new avatar image URL
    console.log(`💾 Updating database with new avatar image URL...`);
    await prisma.userAvatar.update({
      where: { userId },
      data: { avatarImageUrl: imageUrl },
    });

    console.log(`✅ Database updated successfully`);
    console.log(`📋 Summary for user ${userId}:`);
    console.log(`   - R2 Key: ${key}`);
    console.log(`   - Public URL: ${imageUrl}`);

    return imageUrl;
  } catch (error) {
    console.error(`❌ Avatar PNG generation failed for user ${userId}:`, error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
