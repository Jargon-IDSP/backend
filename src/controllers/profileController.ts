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
      introductionViewed: true,
      onboardingCompleted: true,
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

export const updateOnboarding = async (c: Context) => {
  const user = c.get("user");

  try {
    const body = await c.req.json();
    const { language, industry } = body;

    // Validate language
    const validLanguages = ["english", "french", "spanish", "punjabi", "chinese", "korean"];
    if (language && !validLanguages.includes(language.toLowerCase())) {
      return c.json({ error: "Invalid language selection" }, 400);
    }

    // Find industry ID if industry name is provided
    let industryId: number | null = null;
    if (industry) {
      const validIndustries = ["general", "electrician", "plumber", "carpenter", "mechanic", "welder"];
      if (!validIndustries.includes(industry.toLowerCase())) {
        return c.json({ error: "Invalid industry selection" }, 400);
      }

      // Get industry ID from database
      const industryRecord = await prisma.industry.findUnique({
        where: { name: industry.toLowerCase() }
      });

      if (industryRecord) {
        industryId = industryRecord.id;
      }
    }

    // Update user preferences
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        language: language ? language.toLowerCase() : undefined,
        industryId: industryId !== null ? industryId : undefined,
        onboardingCompleted: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        language: true,
        industryId: true,
        onboardingCompleted: true,
        score: true,
      }
    });

    return c.json({
      message: "Onboarding preferences updated successfully",
      user: updatedUser
    }, 200);

  } catch (error) {
    console.error("Error updating onboarding preferences:", error);
    return c.json({ error: "Failed to update preferences" }, 500);
  }
};

export const markIntroductionViewed = async (c: Context) => {
  const user = c.get("user");

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        introductionViewed: true,
      },
      select: {
        id: true,
        email: true,
        introductionViewed: true,
        onboardingCompleted: true,
      }
    });

    return c.json({
      message: "Introduction marked as viewed",
      user: updatedUser
    }, 200);

  } catch (error) {
    console.error("Error marking introduction as viewed:", error);
    return c.json({ error: "Failed to update introduction status" }, 500);
  }
};