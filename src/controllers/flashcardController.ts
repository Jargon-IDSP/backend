import type { Context } from "hono";
import type { FlashcardWithRelations, LevelData } from "../interfaces/flashcardData";
import {
  extractQueryParams,
  extractRouteParams,
  buildWhereClause,
  calculateAvailableTerms,
  enrichFlashcard,
  combineFlashcardsForPractice} from "./helperFunctions/flashcardHelper";
  import { enrichCustomFlashcard } from "./helperFunctions/customFlashcardHelper";
import {
  generateCacheKey,
  withCache,
  clearAllCache,
  getCacheStatistics,
} from "./helperFunctions/cacheHelper";
import {
  errorResponse,
  successResponse,
} from "./helperFunctions/responseHelper";
import { normalizeLanguage, getFlashcardSelect } from './helperFunctions/flashcardHelper';


import { prisma } from '../lib/prisma';

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


export const getFlashcardsByLevel = async (c: Context) => {
  try {
    const { levelId } = extractRouteParams(c);
    const { language } = extractQueryParams(c);
    const lang = normalizeLanguage(language); 

    if (!levelId) {
      return errorResponse(c, "Level ID is required", 400);
    }

    const cacheKey = generateCacheKey("level", { levelId, language });

    const response = await withCache(cacheKey, async () => {
      const flashcards = await prisma.flashcard.findMany({
        where: { levelId: parseInt(levelId) },
        select: {
      ...getFlashcardSelect(lang),
          industry: { select: { name: true } },
      level: { select: { name: true } }
        },
      });

      if (flashcards.length === 0) {
        throw new Error("No flashcards found for this level");
      }

      const displayFlashcards = flashcards.map(card => enrichFlashcard(card, lang));

      return successResponse(displayFlashcards, {
        count: flashcards.length,
        level_id: levelId,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching flashcards by level:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch flashcards by level",
      error.message === "No flashcards found for this level" ? 404 : 500
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

    const cacheKey = generateCacheKey("industry", { industryId, language });

    const response = await withCache(cacheKey, async () => {
      const flashcards = await prisma.flashcard.findMany({
        where: { industryId: parseInt(industryId) },
        include: {
          industry: true,
          level: true,
        },
      });

      if (flashcards.length === 0) {
        throw new Error("No flashcards found for this industry");
      }

      const displayFlashcards = flashcards.map((card: FlashcardWithRelations) =>
        enrichFlashcard(card, language)
      );

      return successResponse(displayFlashcards, {
        count: flashcards.length,
        industry_id: industryId,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching flashcards by industry:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch flashcards by industry",
      error.message === "No flashcards found for this industry" ? 404 : 500
    );
  }
};

export const getFlashcards = async (c: Context) => {
  try {
    const { language, industryId, levelId } = extractQueryParams(c);
    const cacheKey = generateCacheKey("flashcards", { language, industryId, levelId });

    const response = await withCache(cacheKey, async () => {
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

      return successResponse(displayFlashcards, {
        count: flashcards.length,
        filters: { language, industry_id: industryId, level_id: levelId },
      });
    });

    return c.json(response);
  } catch (error) {
    console.error("Error fetching flashcards:", error);
    return errorResponse(c, "Failed to fetch flashcards");
  }
};

export const getRandomFlashcard = async (c: Context) => {
  try {
    const { language, industryId, levelId } = extractQueryParams(c);

    if (flashcardCache.length === 0) {
      await initializeCache();
      if (flashcardCache.length === 0) {
        return errorResponse(c, "No flashcards available in database", 404);
      }
    }

    let eligibleIds = [...flashcardCache];

    if (industryId) {
      eligibleIds = eligibleIds.filter((f) => f.industryId === parseInt(industryId));
    }
    if (levelId) {
      eligibleIds = eligibleIds.filter((f) => f.levelId === parseInt(levelId));
    }

    if (eligibleIds.length === 0) {
      return errorResponse(c, "No flashcards found matching the criteria", 404);
    }

    const randomIndex = Math.floor(Math.random() * eligibleIds.length);
    const selectedCard = eligibleIds[randomIndex];

    if (!selectedCard) {
      return errorResponse(c, "Error selecting random flashcard");
    }

    const cacheKey = `flashcard:${selectedCard.id}:${language}`;

    const response = await withCache(
      cacheKey,
      async () => {
        const randomFlashcard = await prisma.flashcard.findUnique({
          where: { id: selectedCard.id },
          include: {
            industry: true,
            level: true,
          },
        });

        if (!randomFlashcard) {
          throw new Error("No flashcard found");
        }

        const displayCard = enrichFlashcard(randomFlashcard, language);

        return successResponse(displayCard, {
          selectedLanguage: language,
        });
      },
      600
    );

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching random flashcard:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch random flashcard",
      error.message === "No flashcard found" ? 404 : 500
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

    const cacheKey = generateCacheKey("practice-terms", { levelId, language, industryId });

    const response = await withCache(cacheKey, async () => {
      const parsedLevelId = parseInt(levelId);
      const parsedIndustryId = industryId ? parseInt(industryId) : null;

      let industryFlashcards: FlashcardWithRelations[] = [];
      let generalFlashcards: FlashcardWithRelations[] = [];

      if (parsedIndustryId) {
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
      }

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

      const combinedFlashcards = combineFlashcardsForPractice(
        industryFlashcards,
        generalFlashcards
      );

      if (combinedFlashcards.length === 0) {
        throw new Error("No flashcards found for this level");
      }

      const displayFlashcards = combinedFlashcards.map((card: FlashcardWithRelations) =>
        enrichFlashcard(card, language)
      );

      return successResponse(displayFlashcards, {
        count: displayFlashcards.length,
        industryCount: industryFlashcards.length,
        generalCount: Math.min(generalFlashcards.length, 50 - industryFlashcards.length),
        level_id: levelId,
        filters: { language, industry_id: industryId },
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching practice terms by level:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch practice terms",
      error.message === "No flashcards found for this level" ? 404 : 500
    );
  }
};

export const getIndustries = async (c: Context) => {
  try {
    const cacheKey = "industries:all";

    const response = await withCache(
      cacheKey,
      async () => {
        const industries = await prisma.industry.findMany({
          include: {
            _count: {
              select: { flashcards: true },
            },
          },
        });

        return successResponse(industries, { count: industries.length });
      },
      3600
    );

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

    const cacheKey = generateCacheKey("levels", { levelId, language, industryId });

    const response = await withCache(
      cacheKey,
      async () => {
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
          throw new Error(levelId ? "Level not found" : "No levels found");
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

        return successResponse(levelId ? levelsWithCounts[0] : levelsWithCounts, {
          count: levelsWithCounts.length,
          filters: { language, industry_id: industryId },
        });
      },
      3600
    );

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching levels:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch levels",
      error.message?.includes("not found") ? 404 : 500
    );
  }
};


export const getCustomFlashcardsByDocument = async (c: Context) => {
  try {
    const documentId = c.req.param("documentId");
    const { language } = extractQueryParams(c);

    if (!documentId) {
      return errorResponse(c, "Document ID is required", 400);
    }

    const cacheKey = generateCacheKey("custom-document", { documentId, language });

    const response = await withCache(cacheKey, async () => {
      const flashcards = await prisma.customFlashcard.findMany({
        where: { documentId },
        include: {
          document: true,
        },
      });

      if (flashcards.length === 0) {
        throw new Error("No flashcards found for this document");
      }

      const displayFlashcards = flashcards.map((card: any) =>
        enrichCustomFlashcard(card, language)
      );

      return successResponse(displayFlashcards, {
        count: flashcards.length,
        document_id: documentId,
      });
    });

    return c.json(response);
  } catch (error: any) {
    console.error("Error fetching custom flashcards by document:", error);
    return errorResponse(
      c,
      error.message || "Failed to fetch custom flashcards",
      error.message === "No flashcards found for this document" ? 404 : 500
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

    const cacheKey = generateCacheKey("custom-user", { userId, language });

    const response = await withCache(cacheKey, async () => {
      const flashcards = await prisma.customFlashcard.findMany({
        where: { userId },
        include: {
          document: true,
        },
      });

      console.log(`Found ${flashcards.length} custom flashcards for user ${userId}`);

      const displayFlashcards = flashcards.map((card: any) =>
        enrichCustomFlashcard(card, language)
      );

      return successResponse(displayFlashcards, {
        count: flashcards.length,
        user_id: userId,
      });
    });

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

    const categoryEnum = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

    const quizzes = await prisma.customQuiz.findMany({
      where: {
        userId: user.id,
        category: categoryEnum as any,
      },
      select: { id: true },
    });

    if (quizzes.length === 0) {
      return c.json(successResponse([], {
        count: 0,
        category: categoryEnum,
        selectedLanguage: lang,
      }));
    }

    const quizIds = quizzes.map(q => q.id);

    const questions = await prisma.customQuestion.findMany({
      where: {
        userId: user.id,
        customQuizId: { in: quizIds },
      },
      select: {
        correctTermId: true,
      },
    });

    const termIds = [...new Set(questions.map(q => q.correctTermId))];

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

    const displayFlashcards = flashcards.map(card => enrichCustomFlashcard(card, lang));

    const response = successResponse(displayFlashcards, {
      count: flashcards.length,
      category: categoryEnum,
      selectedLanguage: lang,
    });

    return c.json(response);
  } catch (error) {
    console.error("Error fetching custom flashcards by category:", error);
    return errorResponse(c, "Failed to fetch custom flashcards by category");
  }
};

