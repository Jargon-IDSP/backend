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
      defaultPrivacy: true,
      linkedinUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      indeedUrl: true,
      createdAt: true,
      updatedAt: true,
      avatar: {
        select: {
          body: true,
          bodyColor: true,
          hairColor: true,
          expression: true,
          hair: true,
          headwear: true,
          eyewear: true,
          facial: true,
          clothing: true,
          shoes: true,
          accessories: true,
        },
      },
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

    // Update user preferences and initialize apprenticeship progress
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

    // Initialize apprenticeship progress for Foundation level (level 1) if industry was selected
    if (industryId !== null) {
      // Check if progress record already exists
      const existingProgress = await prisma.userApprenticeshipProgress.findUnique({
        where: {
          userId_levelId_industryId: {
            userId: user.id,
            levelId: 1,
            industryId: industryId,
          },
        },
      });

      // Only create if it doesn't exist
      if (!existingProgress) {
        await prisma.userApprenticeshipProgress.create({
          data: {
            userId: user.id,
            levelId: 1, // Foundation level
            industryId: industryId,
            quizzesCompleted: 0,
            isLevelComplete: false,
          },
        });
      }
    }

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

export const updateSocialMedia = async (c: Context) => {
  const user = c.get("user");

  try {
    const body = await c.req.json();
    const { linkedinUrl, facebookUrl, instagramUrl, indeedUrl } = body;

    const updateData: {
      linkedinUrl?: string | null;
      facebookUrl?: string | null;
      instagramUrl?: string | null;
      indeedUrl?: string | null;
    } = {};

    if (linkedinUrl !== undefined) updateData.linkedinUrl = linkedinUrl;
    if (facebookUrl !== undefined) updateData.facebookUrl = facebookUrl;
    if (instagramUrl !== undefined) updateData.instagramUrl = instagramUrl;
    if (indeedUrl !== undefined) updateData.indeedUrl = indeedUrl;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        linkedinUrl: true,
        facebookUrl: true,
        instagramUrl: true,
        indeedUrl: true,
      }
    });

    return c.json({
      message: "Social media links updated successfully",
      user: updatedUser
    }, 200);

  } catch (error) {
    console.error("Error updating social media links:", error);
    return c.json({ error: "Failed to update social media links" }, 500);
  }
};