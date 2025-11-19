import type { Context } from "hono";
import { prisma } from "../lib/prisma";

export const avatar = async (c: Context) => {
  const user = c.get("user");
  
  let userAvatar = await prisma.userAvatar.findUnique({
    where: { userId: user.id }
  });
  
  if (!userAvatar) {
    userAvatar = await prisma.userAvatar.create({
      data: {
        userId: user.id,
        character: "rocky",
        outfit: "default",
        primaryColor: "#FFB6C1",
        secondaryColor: "#FF69B4",
        accentColor: "#FFC0CB",
        unlockedItems: "[]"
      }
    });
  }
  
  return c.json({ 
    avatarConfig: {
      character: userAvatar.character,
      outfit: userAvatar.outfit,
      hatType: userAvatar.hatType,
      accessories: [
        userAvatar.accessory1,
        userAvatar.accessory2,
        userAvatar.accessory3
      ].filter(Boolean),
      colors: {
        primary: userAvatar.primaryColor,
        secondary: userAvatar.secondaryColor,
        accent: userAvatar.accentColor
      },
      unlockedItems: JSON.parse(userAvatar.unlockedItems || "[]")
    }
  }, 200);
};

export const updateAvatar = async (c: Context) => {
  const user = c.get("user");

  try {
    const body = await c.req.json();

    // Validate that we have at least some data to update
    if (!body || typeof body !== 'object') {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const updatedAvatar = await prisma.userAvatar.upsert({
      where: { userId: user.id },
      update: {
        outfit: body.outfit !== undefined ? body.outfit : undefined,
        hatType: body.hatType !== undefined ? body.hatType : undefined,
        accessory1: body.accessories?.[0] !== undefined ? body.accessories[0] : undefined,
        accessory2: body.accessories?.[1] !== undefined ? body.accessories[1] : undefined,
        accessory3: body.accessories?.[2] !== undefined ? body.accessories[2] : undefined,
        primaryColor: body.colors?.primary !== undefined ? body.colors.primary : undefined,
        secondaryColor: body.colors?.secondary !== undefined ? body.colors.secondary : undefined,
        accentColor: body.colors?.accent !== undefined ? body.colors.accent : undefined,
      },
      create: {
        userId: user.id,
        character: "rocky",
        outfit: body.outfit || "default",
        hatType: body.hatType || null,
        accessory1: body.accessories?.[0] || null,
        accessory2: body.accessories?.[1] || null,
        accessory3: body.accessories?.[2] || null,
        primaryColor: body.colors?.primary || "#FFB6C1",
        secondaryColor: body.colors?.secondary || "#FF69B4",
        accentColor: body.colors?.accent || "#FFC0CB",
        unlockedItems: "[]"
      }
    });

    // If imageUrl is provided, update the user's profile image
    if (body.imageUrl) {
      await prisma.user.update({
        where: { id: user.id },
        data: { imageUrl: body.imageUrl }
      });
    }

    return c.json({
      success: true,
      avatarConfig: {
        character: updatedAvatar.character,
        outfit: updatedAvatar.outfit,
        hatType: updatedAvatar.hatType,
        accessories: [
          updatedAvatar.accessory1,
          updatedAvatar.accessory2,
          updatedAvatar.accessory3
        ].filter(Boolean),
        colors: {
          primary: updatedAvatar.primaryColor,
          secondary: updatedAvatar.secondaryColor,
          accent: updatedAvatar.accentColor
        },
        unlockedItems: JSON.parse(updatedAvatar.unlockedItems || "[]")
      }
    }, 200);
  } catch (error) {
    console.error("Error updating avatar:", error);
    return c.json({
      error: "Failed to update avatar"
    }, 500);
  }
};