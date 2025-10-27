import type { Context } from "hono";
import type {
  FlashcardWithRelations,
  LevelData,
} from "../interfaces/flashcardData";
import {
  extractQueryParams,
  extractRouteParams,
  buildWhereClause,
  calculateAvailableTerms,
  enrichFlashcard,
  combineFlashcardsForPractice,
} from "./helperFunctions/flashcardHelper";
import { enrichCustomFlashcard } from "./helperFunctions/customFlashcardHelper";
import {
  errorResponse,
  successResponse,
} from "./helperFunctions/responseHelper";
import {
  normalizeLanguage,
  getFlashcardSelect,
} from "./helperFunctions/flashcardHelper";
import redisClient from "../lib/redis";
import { prisma } from "../lib/prisma";

// NOTE: flashcardCache was removed - we now use Redis caching instead
// The old in-memory cache was causing 6-7 second delays on every request

// Helper function to get from cache
const getFromCache = async <T>(key: string): Promise<T | null> => {
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      console.log(`✅ Cache HIT: ${key}`);
      return JSON.parse(cached) as T;
    }
    console.log(`❌ Cache MISS: ${key}`);
    return null;
  } catch (error) {
    console.error(`Error getting cache for ${key}:`, error);
    return null;
  }
};

// Helper function to set cache
const setCache = async <T>(
  key: string,
  data: T,
  ttl: number = 300
): Promise<void> => {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(data));
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error(`Error setting cache for ${key}:`, error);
  }
};

// Helper function to invalidate cache by pattern
const invalidateCachePattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(
        `🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`
      );
    }
  } catch (error) {
    console.error(`Error invalidating cache pattern ${pattern}:`, error);
  }
};

// NOTE: initializeCache removed - caused 6-7 second delays
// Now using Redis caching + database indexes instead

export const getFlashcardsByLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language } = extractQueryParams(c);
    const lang = normalizeLanguage(language);

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    // Check cache first
    const cacheKey = `flashcards:level:${levelId}:${lang}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const flashcards = await prisma.flashcard.findMany({
      where: { levelId: parseInt(levelId) },
      select: {
        ...getFlashcardSelect(lang),
        industry: { select: { name: true } },
        level: { select: { name: true } },
      },
    });

    if (flashcards.length === 0) {
      return errorResponse(c, "No flashcards found for this level", 404);
    }

    const displayFlashcards = flashcards.map((card) =>
      enrichFlashcard(card, lang)
    );

    const response = successResponse(displayFlashcards, {
      count: flashcards.length,
      level_id: levelId,
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching flashcards by level:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch flashcards by level",
      500
    );
  }
};

export const getFlashcardsByIndustry = async (c: Context) => {
  try {
    const { industryId } = extractRouteParams(c);
    const { language } = extractQueryParams(c);

    if (!industryId) {
      return errorResponse(c, "Industry ID is required", 400);
    }

    // Check cache first
    const cacheKey = `flashcards:industry:${industryId}:${language}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const flashcards = await prisma.flashcard.findMany({
      where: { industryId: parseInt(industryId) },
      include: {
        industry: true,
        level: true,
      },
    });

    if (flashcards.length === 0) {
      return errorResponse(c, "No flashcards found for this industry", 404);
    }

    const displayFlashcards = flashcards.map((card: FlashcardWithRelations) =>
      enrichFlashcard(card, language)
    );

    const response = successResponse(displayFlashcards, {
      count: flashcards.length,
      industry_id: industryId,
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching flashcards by industry:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch flashcards by industry",
      500
    );
  }
};

export const getFlashcards = async (c: Context) => {
  try {
    const { language, industryId, levelId } = extractQueryParams(c);

    // Check cache first
    const cacheKey = `flashcards:all:${language || "en"}:${
      industryId || "all"
    }:${levelId || "all"}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const whereClause = buildWhereClause({ industryId, levelId });

    const flashcards = await prisma.flashcard.findMany({
      where: whereClause,
      include: {
        industry: true,
        level: true,
      },
    });

    const displayFlashcards = flashcards.map((card: FlashcardWithRelations) =>
      enrichFlashcard(card, language)
    );

    const response = successResponse(displayFlashcards, {
      count: flashcards.length,
      filters: { language, industry_id: industryId, level_id: levelId },
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching flashcards:", error);
    return errorResponse(c, "Failed to fetch flashcards");
  }
};

export const getRandomFlashcard = async (c: Context) => {
  try {
    const { language, industryId, levelId } = extractQueryParams(c);

    // Build where clause for filtering
    const whereClause: any = {};
    if (levelId) {
      whereClause.levelId = parseInt(levelId);
    }
    if (industryId) {
      whereClause.industryId = parseInt(industryId);
    }

    // Count total flashcards matching criteria
    const totalFlashcards = await prisma.flashcard.count({
      where: whereClause,
    });

    if (totalFlashcards === 0) {
      return errorResponse(c, "No flashcards found matching the criteria", 404);
    }

    // Get random offset
    const randomOffset = Math.floor(Math.random() * totalFlashcards);

    // Fetch one random flashcard
    const flashcards = await prisma.flashcard.findMany({
      where: whereClause,
      skip: randomOffset,
      take: 1,
      include: {
        industry: true,
        level: true,
      },
    });

    const randomFlashcard = flashcards[0];

    if (!randomFlashcard) {
      return errorResponse(c, "No flashcard found", 404);
    }

    const displayCard = enrichFlashcard(randomFlashcard, language);

    const response = successResponse(displayCard, {
      selectedLanguage: language,
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching random flashcard:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch random flashcard",
      500
    );
  }
};

export const getPracticeTermsByLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language, industryId } = extractQueryParams(c);

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    // Check cache first
    const cacheKey = `practice:level:${levelId}:${language}:${
      industryId || "all"
    }`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const parsedLevelId = parseInt(levelId);
    const parsedIndustryId = industryId ? parseInt(industryId) : null;

    let industryFlashcards: FlashcardWithRelations[] = [];
    let generalFlashcards: FlashcardWithRelations[] = [];

    const dbStart = Date.now();

    if (parsedIndustryId) {
      const industryStart = Date.now();
      industryFlashcards = await prisma.flashcard.findMany({
        where: {
          levelId: parsedLevelId,
          industryId: parsedIndustryId,
        },
        include: {
          industry: true,
          level: true,
        },
      });
      console.log(
        `⏱️  Industry flashcards query: ${Date.now() - industryStart}ms (${
          industryFlashcards.length
        } results)`
      );
    }

    const generalStart = Date.now();
    generalFlashcards = await prisma.flashcard.findMany({
      where: {
        levelId: parsedLevelId,
        industryId: null,
      },
      include: {
        industry: true,
        level: true,
      },
    });
    console.log(
      `⏱️  General flashcards query: ${Date.now() - generalStart}ms (${
        generalFlashcards.length
      } results)`
    );
    console.log(`⏱️  Total DB time: ${Date.now() - dbStart}ms`);

    const combinedFlashcards = combineFlashcardsForPractice(
      industryFlashcards,
      generalFlashcards
    );

    if (combinedFlashcards.length === 0) {
      return errorResponse(c, "No practice terms found for this level", 404);
    }

    const displayFlashcards = combinedFlashcards.map(
      (card: FlashcardWithRelations) => enrichFlashcard(card, language)
    );

    const response = successResponse(displayFlashcards, {
      count: displayFlashcards.length,
      level_id: levelId,
      industry_id: industryId,
    });

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching practice terms:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch practice terms",
      500
    );
  }
};

export const getIndustries = async (c: Context) => {
  try {
    // Check cache first
    const cacheKey = "industries:all";
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const industries = await prisma.industry.findMany({
      orderBy: {
        name: "asc",
      },
    });

    const response = successResponse(industries, {
      count: industries.length,
    });

    // Cache for 1 hour (industries rarely change)
    await setCache(cacheKey, response, 3600);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching industries:", error);
    return errorResponse(c, "Failed to fetch industries");
  }
};

export const getLevels = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language, industryId } = extractQueryParams(c);

    // Check cache first
    const cacheKey = `levels:${levelId || "all"}:${language || "en"}:${
      industryId || "all"
    }`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const parsedIndustryId = industryId ? parseInt(industryId) : null;
    const levelWhere = buildWhereClause({ levelId });

    const levels = await prisma.level.findMany({
      where: levelWhere,
      include: {
        _count: {
          select: { flashcards: true },
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    if (levels.length === 0) {
      return errorResponse(
        c,
        levelId ? "Level not found" : "No levels found",
        404
      );
    }

    const levelsWithCounts = await Promise.all(
      levels.map(async (level: LevelData) => {
        const terms = await calculateAvailableTerms(level.id, parsedIndustryId);

        return {
          ...level,
          available_terms: terms.totalAvailable,
          industry_terms: terms.industryCount,
          general_terms: terms.generalCount,
          total_general_terms: terms.totalGeneralCount,
        };
      })
    );

    const response = successResponse(
      levelId ? levelsWithCounts[0] : levelsWithCounts,
      {
        count: levelsWithCounts.length,
        filters: { language, industry_id: industryId },
      }
    );

    // Cache for 1 hour (levels rarely change)
    await setCache(cacheKey, response, 3600);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching levels:", error);
    return errorResponse(c, error.message || "Failed to fetch levels", 500);
  }
};

export const getCustomFlashcardsByDocument = async (c: Context) => {
  try {
    const documentId = c.req.param("documentId");
    const { language } = extractQueryParams(c);

    if (!documentId) {
      return errorResponse(c, "Document ID is required", 400);
    }

    // Check cache first
    const cacheKey = `custom:document:${documentId}:${language}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const flashcards = await prisma.customFlashcard.findMany({
      where: { documentId },
      include: {
        document: true,
      },
    });

    if (flashcards.length === 0) {
      return errorResponse(c, "No flashcards found for this document", 404);
    }

    const displayFlashcards = flashcards.map((card: any) =>
      enrichCustomFlashcard(card, language)
    );

    const response = successResponse(displayFlashcards, {
      count: flashcards.length,
      document_id: documentId,
    });

    // Cache for 10 minutes
    await setCache(cacheKey, response, 600);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom flashcards by document:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom flashcards",
      500
    );
  }
};

export const getCustomFlashcardsByUser = async (c: Context) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return errorResponse(c, "User not authenticated", 401);
    }

    const userId = user.id;
    const { language } = extractQueryParams(c);

    console.log("Fetching custom flashcards for user:", userId);

    // Check cache first
    const cacheKey = `custom:user:${userId}:${language}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const flashcards = await prisma.customFlashcard.findMany({
      where: { userId },
      include: {
        document: true,
      },
    });

    console.log(
      `Found ${flashcards.length} custom flashcards for user ${userId}`
    );

    const displayFlashcards = flashcards.map((card: any) =>
      enrichCustomFlashcard(card, language)
    );

    const response = successResponse(displayFlashcards, {
      count: flashcards.length,
      user_id: userId,
    });

    // Cache for 2 minutes (user data changes more frequently)
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom flashcards by user:", error);
    console.error("Error stack:", error.stack);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom flashcards",
      500
    );
  }
};

export const getRandomCustomFlashcard = async (c: Context) => {
  try {
    const userId = c.req.param("userId");
    const { language } = extractQueryParams(c);
    const documentId = c.req.query("document_id");

    if (!userId) {
      return errorResponse(c, "User ID is required", 400);
    }

    const whereClause = buildWhereClause({ userId, documentId });

    const flashcards = await prisma.customFlashcard.findMany({
      where: whereClause,
      include: {
        document: true,
      },
    });

    if (flashcards.length === 0) {
      return errorResponse(c, "No custom flashcards found", 404);
    }

    const randomIndex = Math.floor(Math.random() * flashcards.length);
    const randomFlashcard = flashcards[randomIndex];

    const displayCard = enrichCustomFlashcard(randomFlashcard, language);

    const response = successResponse(displayCard, {
      selectedLanguage: language,
    });

    return c.json(response);
  } catch (error) {
    console.error("Error fetching random custom flashcard:", error);
    return errorResponse(c, "Failed to fetch random custom flashcard");
  }
};

export const getCustomFlashcardsByCategory = async (c: Context) => {
  try {
    const user = c.get("user");
    const { category } = c.req.param();
    const { language } = extractQueryParams(c);
    const lang = normalizeLanguage(language);

    if (!category) {
      return errorResponse(c, "Category is required", 400);
    }

    const categoryEnum =
      category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

    // Check cache first
    const cacheKey = `custom:category:${user.id}:${categoryEnum}:${lang}`;
    const cached = await getFromCache<any>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const quizzes = await prisma.customQuiz.findMany({
      where: {
        userId: user.id,
        category: categoryEnum as any,
      },
      select: { id: true },
    });

    if (quizzes.length === 0) {
      const emptyResponse = successResponse([], {
        count: 0,
        category: categoryEnum,
        selectedLanguage: lang,
      });
      // Cache empty results for 1 minute
      await setCache(cacheKey, emptyResponse, 60);
      return c.json(emptyResponse);
    }

    const quizIds = quizzes.map((q) => q.id);

    const questions = await prisma.customQuestion.findMany({
      where: {
        userId: user.id,
        customQuizId: { in: quizIds },
      },
      select: {
        correctTermId: true,
      },
    });

    const termIds = [...new Set(questions.map((q) => q.correctTermId))];

    const flashcards = await prisma.customFlashcard.findMany({
      where: {
        id: { in: termIds },
        userId: user.id,
      },
      select: {
        id: true,
        termEnglish: true,
        termFrench: true,
        termChinese: true,
        termSpanish: true,
        termTagalog: true,
        termPunjabi: true,
        termKorean: true,
        definitionEnglish: true,
        definitionFrench: true,
        definitionChinese: true,
        definitionSpanish: true,
        definitionTagalog: true,
        definitionPunjabi: true,
        definitionKorean: true,
        document: {
          select: {
            id: true,
            filename: true,
          },
        },
      },
    });

    const displayFlashcards = flashcards.map((card) =>
      enrichCustomFlashcard(card, lang)
    );

    const response = successResponse(displayFlashcards, {
      count: flashcards.length,
      category: categoryEnum,
      selectedLanguage: lang,
    });

    // Cache for 2 minutes
    await setCache(cacheKey, response, 120);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching custom flashcards by category:", error);
    return errorResponse(c, "Failed to fetch custom flashcards by category");
  }
};

// Utility function to invalidate all flashcard caches (call this when flashcards are updated)
export const invalidateFlashcardCaches = async () => {
  await invalidateCachePattern("flashcards:*");
  await invalidateCachePattern("practice:*");
  await invalidateCachePattern("levels:*");
  await invalidateCachePattern("industries:*");
  console.log("🗑️  All flashcard caches invalidated");
};

// Utility function to invalidate custom flashcard caches for a user
export const invalidateCustomFlashcardCaches = async (userId: string) => {
  await invalidateCachePattern(`custom:user:${userId}:*`);
  await invalidateCachePattern(`custom:category:${userId}:*`);
  console.log(`🗑️  Custom flashcard caches invalidated for user: ${userId}`);
};

// Utility function to invalidate custom flashcard caches for a document
export const invalidateDocumentFlashcardCaches = async (documentId: string) => {
  await invalidateCachePattern(`custom:document:${documentId}:*`);
  console.log(
    `🗑️  Custom flashcard caches invalidated for document: ${documentId}`
  );
};
