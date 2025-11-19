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
        body: "body-1",
        expression: null,
        hair: null,
        headwear: null,
        eyewear: null,
        facial: null,
        clothing: null,
        shoes: null,
        accessories: null,
        unlockedItems: "[]"
      }
    });
  }

  return c.json({
    avatarConfig: {
      body: userAvatar.body,
      expression: userAvatar.expression,
      hair: userAvatar.hair,
      headwear: userAvatar.headwear,
      eyewear: userAvatar.eyewear,
      facial: userAvatar.facial,
      clothing: userAvatar.clothing,
      shoes: userAvatar.shoes,
      accessories: userAvatar.accessories ? JSON.parse(userAvatar.accessories) : [],
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
        body: body.body,
        expression: body.expression || null,
        hair: body.hair || null,
        headwear: body.headwear || null,
        eyewear: body.eyewear || null,
        facial: body.facial || null,
        clothing: body.clothing || null,
        shoes: body.shoes || null,
        accessories: body.accessories ? JSON.stringify(body.accessories) : null,
      },
      create: {
        userId: user.id,
        body: body.body || "body-1",
        expression: body.expression || null,
        hair: body.hair || null,
        headwear: body.headwear || null,
        eyewear: body.eyewear || null,
        facial: body.facial || null,
        clothing: body.clothing || null,
        shoes: body.shoes || null,
        accessories: body.accessories ? JSON.stringify(body.accessories) : null,
        unlockedItems: "[]"
      }
    });

    return c.json({
      success: true,
      avatarConfig: {
        body: updatedAvatar.body,
        expression: updatedAvatar.expression,
        hair: updatedAvatar.hair,
        headwear: updatedAvatar.headwear,
        eyewear: updatedAvatar.eyewear,
        facial: updatedAvatar.facial,
        clothing: updatedAvatar.clothing,
        shoes: updatedAvatar.shoes,
        accessories: updatedAvatar.accessories ? JSON.parse(updatedAvatar.accessories) : [],
        unlockedItems: JSON.parse(updatedAvatar.unlockedItems || "[]")
      }
    }, 200);
  } catch (error) {
    console.error("Failed to update avatar:", error);
    return c.json({
      error: "Failed to update avatar"
    }, 500);
  }
};