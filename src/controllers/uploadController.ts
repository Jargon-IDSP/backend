import type { Context } from "hono";
import { prisma } from "../lib/prisma";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

/**
 * Handles avatar image upload
 * Accepts multipart/form-data with an 'avatar' file field
 */
export const uploadAvatarImage = async (c: Context) => {
  const user = c.get("user");

  try {
    // Get the uploaded file from the request
    const body = await c.req.parseBody();
    const file = body['avatar'];

    if (!file || typeof file === 'string') {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "Invalid file type. Only PNG, JPG, and SVG are allowed." }, 400);
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      return c.json({ error: "File too large. Maximum size is 5MB." }, 400);
    }

    // Generate unique filename
    const fileExtension = file.type === 'image/svg+xml' ? 'svg' :
                          file.type === 'image/jpeg' ? 'jpg' : 'png';
    const randomName = crypto.randomBytes(16).toString('hex');
    const fileName = `avatar-${user.id}-${randomName}.${fileExtension}`;

    // Define upload directory
    const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
    const filePath = path.join(uploadDir, fileName);

    // Ensure upload directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save file to disk
    await fs.writeFile(filePath, buffer);

    // Generate the public URL for the uploaded image
    const imageUrl = `/uploads/avatars/${fileName}`;

    // Update user's profile with the new avatar URL
    await prisma.user.update({
      where: { id: user.id },
      data: {
        imageUrl: imageUrl
      },
    });

    return c.json({
      success: true,
      imageUrl: imageUrl,
      message: "Avatar uploaded successfully"
    }, 200);

  } catch (error) {
    console.error("Error uploading avatar:", error);
    return c.json({ error: "Failed to upload avatar" }, 500);
  }
};

/**
 * Deletes the old avatar file from the filesystem
 */
export async function deleteOldAvatar(oldImageUrl: string) {
  try {
    if (!oldImageUrl || !oldImageUrl.startsWith('/uploads/avatars/')) {
      return; // Not a local file, skip deletion
    }

    const filePath = path.join(process.cwd(), oldImageUrl);
    await fs.unlink(filePath);
    console.log(`Deleted old avatar: ${filePath}`);
  } catch (error) {
    console.error("Error deleting old avatar:", error);
    // Don't throw error, just log it
  }
}
