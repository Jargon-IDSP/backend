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
  const body = await c.req.json();
  
  try {
    const updatedAvatar = await prisma.userAvatar.upsert({
      where: { userId: user.id },
      update: {
        outfit: body.outfit,
        hatType: body.hatType,
        accessory1: body.accessories?.[0] || null,
        accessory2: body.accessories?.[1] || null,
        accessory3: body.accessories?.[2] || null,
        primaryColor: body.colors?.primary,
        secondaryColor: body.colors?.secondary,
        accentColor: body.colors?.accent,
      },
      create: {
        userId: user.id,
        character: "rocky",
        outfit: body.outfit || "default",
        hatType: body.hatType,
        accessory1: body.accessories?.[0],
        accessory2: body.accessories?.[1],
        accessory3: body.accessories?.[2],
        primaryColor: body.colors?.primary || "#FFB6C1",
        secondaryColor: body.colors?.secondary || "#FF69B4",
        accentColor: body.colors?.accent || "#FFC0CB",
        unlockedItems: "[]"
      }
    });
    
    return c.json({ 
      success: true, 
      avatar: updatedAvatar 
    }, 200);
  } catch (error) {
    return c.json({ 
      error: "Failed to update avatar" 
    }, 500);
  }
};