import type { Context } from "hono";
const prismaModule = (await import("@prisma/client")) as any;
const { PrismaClient } = prismaModule;
import type { FlashcardWithRelations } from "../interfaces/flashcardData";
import NodeCache from "node-cache";

const prisma = new PrismaClient();

// Initialize cache with TTL (Time To Live)
const responseCache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
});

let flashcardCache: {
  id: string;
  industryId: number | null;
  levelId: number;
}[] = [];

export const initializeCache = async () => {
  console.log("Loading flashcard cache...");
  try {
    flashcardCache = await prisma.flashcard.findMany({
      select: {
        id: true,
        industryId: true,
        levelId: true,
      },
    });
    console.log(`Cached ${flashcardCache.length} flashcards`);
  } catch (error) {
    console.error("Error initializing cache:", error);
    flashcardCache = [];
  }
};

// Helper function to generate cache keys
const generateCacheKey = (prefix: string, params: Record<string, any>) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key] || "null"}`)
    .join("&");
  return `${prefix}:${sortedParams}`;
};

const convertToDisplayFormat = (dbFlashcard: any, language?: string) => {
  const result: any = {
    id: dbFlashcard.id,
    term: {
      english: dbFlashcard.termEnglish,
    },
    definition: {
      english: dbFlashcard.definitionEnglish,
    },
    industry_id: dbFlashcard.industryId,
    level_id: dbFlashcard.levelId,
  };

  if (language) {
    result.term[language] = getTermByLanguage(dbFlashcard, language);
    result.definition[language] = getDefinitionByLanguage(
      dbFlashcard,
      language
    );
  }
  return result;
};

const getTermByLanguage = (dbFlashcard: any, language: string) => {
  const languageMap: { [key: string]: string } = {
    french: dbFlashcard.termFrench,
    mandarin: dbFlashcard.termMandarin,
    spanish: dbFlashcard.termSpanish,
    tagalog: dbFlashcard.termTagalog,
    punjabi: dbFlashcard.termPunjabi,
    korean: dbFlashcard.termKorean,
  };
  return languageMap[language];
};

const getDefinitionByLanguage = (dbFlashcard: any, language: string) => {
  const languageMap: { [key: string]: string } = {
    french: dbFlashcard.definitionFrench,
    mandarin: dbFlashcard.definitionMandarin,
    spanish: dbFlashcard.definitionSpanish,
    tagalog: dbFlashcard.definitionTagalog,
    punjabi: dbFlashcard.definitionPunjabi,
    korean: dbFlashcard.definitionKorean,
  };
  return languageMap[language];
};

export const getFlashcardsByLevel = async (c: Context) => {
  try {
    const levelId = c.req.param("levelId");
    const language = c.req.query("language");

    if (!levelId) {
      return c.json(
        {
          success: false,
          error: "Level ID is required",
        },
        400
      );
    }

    // Check cache
    const cacheKey = generateCacheKey("level", { levelId, language });
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit: ${cacheKey}`);
      return c.json(cached);
    }

    const flashcards = await prisma.flashcard.findMany({
      where: {
        levelId: parseInt(levelId),
      },
      include: {
        industry: true,
        level: true,
      },
    });

    if (flashcards.length === 0) {
      return c.json(
        {
          success: false,
          error: "No flashcards found for this level",
        },
        404
      );
    }

    const displayFlashcards = flashcards.map(
      (card: FlashcardWithRelations) => ({
        ...convertToDisplayFormat(card, language),
        industry: card.industry.name,
        level: card.level.name,
      })
    );

    const response = {
      success: true,
      count: flashcards.length,
      data: displayFlashcards,
      level_id: levelId,
    };

    // Store in cache
    responseCache.set(cacheKey, response);
    console.log(`Cache set: ${cacheKey}`);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching flashcards by level:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch flashcards by level",
      },
      500
    );
  }
};

export const getFlashcardsByIndustry = async (c: Context) => {
  try {
    const industryId = c.req.param("industryId");
    const language = c.req.query("language");

    if (!industryId) {
      return c.json(
        {
          success: false,
          error: "Industry ID is required",
        },
        400
      );
    }

    // Check cache
    const cacheKey = generateCacheKey("industry", { industryId, language });
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit: ${cacheKey}`);
      return c.json(cached);
    }

    const flashcards = await prisma.flashcard.findMany({
      where: {
        industryId: parseInt(industryId),
      },
      include: {
        industry: true,
        level: true,
      },
    });

    if (flashcards.length === 0) {
      return c.json(
        {
          success: false,
          error: "No flashcards found for this industry",
        },
        404
      );
    }

    const displayFlashcards = flashcards.map(
      (card: FlashcardWithRelations) => ({
        ...convertToDisplayFormat(card, language),
        industry: card.industry.name,
        level: card.level.name,
      })
    );

    const response = {
      success: true,
      count: flashcards.length,
      data: displayFlashcards,
      industry_id: industryId,
    };

    // Store in cache
    responseCache.set(cacheKey, response);
    console.log(`Cache set: ${cacheKey}`);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching flashcards by industry:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch flashcards by industry",
      },
      500
    );
  }
};

export const getFlashcards = async (c: Context) => {
  try {
    const language = c.req.query("language");
    const industryId = c.req.query("industry_id");
    const levelId = c.req.query("level_id");

    // Check cache
    const cacheKey = generateCacheKey("flashcards", {
      language,
      industryId,
      levelId,
    });
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit: ${cacheKey}`);
      return c.json(cached);
    }

    let whereClause: any = {};
    if (industryId) whereClause.industryId = parseInt(industryId);
    if (levelId) whereClause.levelId = parseInt(levelId);

    const flashcards = await prisma.flashcard.findMany({
      where: whereClause,
      include: {
        industry: true,
        level: true,
      },
    });

    const displayFlashcards = flashcards.map(
      (card: FlashcardWithRelations) => ({
        ...convertToDisplayFormat(card, language),
        industry: card.industry ? card.industry.name : null,
        level: card.level.name,
      })
    );

    const response = {
      success: true,
      count: flashcards.length,
      data: displayFlashcards,
      filters: { language, industry_id: industryId, level_id: levelId },
    };

    // Store in cache
    responseCache.set(cacheKey, response);
    console.log(`Cache set: ${cacheKey}`);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching flashcards:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch flashcards",
      },
      500
    );
  }
};

export const getRandomFlashcard = async (c: Context) => {
  try {
    const language = c.req.query("language");
    const industryId = c.req.query("industry_id");
    const levelId = c.req.query("level_id");

    // Ensure cache is loaded
    if (flashcardCache.length === 0) {
      await initializeCache();

      if (flashcardCache.length === 0) {
        return c.json(
          {
            success: false,
            error: "No flashcards available in database",
          },
          404
        );
      }
    }

    let eligibleIds = [...flashcardCache];

    if (industryId) {
      eligibleIds = eligibleIds.filter(
        (f) => f.industryId === parseInt(industryId)
      );
    }
    if (levelId) {
      eligibleIds = eligibleIds.filter((f) => f.levelId === parseInt(levelId));
    }

    if (eligibleIds.length === 0) {
      return c.json(
        {
          success: false,
          error: "No flashcards found matching the criteria",
        },
        404
      );
    }

    const randomIndex = Math.floor(Math.random() * eligibleIds.length);
    const selectedCard = eligibleIds[randomIndex];

    if (!selectedCard) {
      return c.json(
        {
          success: false,
          error: "Error selecting random flashcard",
        },
        500
      );
    }

    const randomId = selectedCard.id;

    // Check if this specific flashcard is cached
    const cacheKey = `flashcard:${randomId}:${language || "null"}`;
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit: ${cacheKey}`);
      return c.json(cached);
    }

    const randomFlashcard = await prisma.flashcard.findUnique({
      where: { id: randomId },
      include: {
        industry: true,
        level: true,
      },
    });

    if (!randomFlashcard) {
      return c.json(
        {
          success: false,
          error: "No flashcard found",
        },
        404
      );
    }

    const languages = [
      "french",
      "mandarin",
      "spanish",
      "tagalog",
      "punjabi",
      "korean",
    ];
    const selectedLanguage =
      language || languages[Math.floor(Math.random() * languages.length)];

    const displayCard = {
      ...convertToDisplayFormat(randomFlashcard, selectedLanguage),
      industry: randomFlashcard.industry?.name || null,
      level: randomFlashcard.level.name,
    };

    const response = {
      success: true,
      data: displayCard,
      selectedLanguage,
    };

    // Store in cache (longer TTL for individual flashcards)
    responseCache.set(cacheKey, response, 600); // 10 minutes
    console.log(`Cache set: ${cacheKey}`);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching random flashcard:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch random flashcard",
      },
      500
    );
  }
};

export const getIndustries = async (c: Context) => {
  try {
    // Check cache
    const cacheKey = "industries:all";
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit: ${cacheKey}`);
      return c.json(cached);
    }

    const industries = await prisma.industry.findMany({
      include: {
        _count: {
          select: { flashcards: true },
        },
      },
    });

    const response = {
      success: true,
      count: industries.length,
      data: industries,
    };

    // Store in cache with longer TTL (industries don't change often)
    responseCache.set(cacheKey, response, 3600); // 1 hour
    console.log(`Cache set: ${cacheKey}`);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching industries:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch industries",
      },
      500
    );
  }
};

export const getLevels = async (c: Context) => {
  try {
    // Check cache
    const cacheKey = "levels:all";
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit: ${cacheKey}`);
      return c.json(cached);
    }

    const levels = await prisma.level.findMany({
      include: {
        _count: {
          select: { flashcards: true },
        },
      },
    });

    const response = {
      success: true,
      count: levels.length,
      data: levels,
    };

    // Store in cache with longer TTL (levels don't change often)
    responseCache.set(cacheKey, response, 3600); // 1 hour
    console.log(`Cache set: ${cacheKey}`);

    return c.json(response);
  } catch (error) {
    console.error("Error fetching levels:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch levels",
      },
      500
    );
  }
};

// Optional: Add cache management endpoints
export const clearCache = async (c: Context) => {
  try {
    responseCache.flushAll();
    return c.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing cache:", error);
    return c.json(
      {
        success: false,
        error: "Failed to clear cache",
      },
      500
    );
  }
};

export const getCacheStats = async (c: Context) => {
  try {
    const stats = responseCache.getStats();
    return c.json({
      success: true,
      stats: {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits / (stats.hits + stats.misses) || 0,
      },
    });
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return c.json(
      {
        success: false,
        error: "Failed to get cache stats",
      },
      500
    );
  }
};
