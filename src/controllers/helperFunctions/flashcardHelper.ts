import type { Context } from "hono";
import { prisma } from "../../lib/prisma";
import type { Langs } from "../../interfaces/customFlashcard";
import {
  normalizeLanguage,
  getLanguageFieldName,
  getLanguageValue,
  getAllLanguageFields,
  getLanguageSelect,
  convertToDisplayFormat,
} from "./translationHelper";

export { normalizeLanguage, getLanguageFieldName, getLanguageValue, getAllLanguageFields };

export const extractQueryParams = (c: Context) => {
  return {
    language: c.req.query("language") || "english",
    industryId: c.req.query("industry_id"),
    levelId: c.req.query("level_id"),
  };
};


export const extractRouteParams = (c: Context) => {
  return {
    levelId: c.req.param("levelId"),
    industryId: c.req.param("industryId"),
    documentId: c.req.param("documentId"),
    userId: c.req.param("userId"),
  };
};


export const buildWhereClause = (filters: {
  levelId?: string | number | null;
  industryId?: string | number | null;
  userId?: string | null;
  documentId?: string | null;
}) => {
  const whereClause: any = {};

  if (filters.levelId) {
    whereClause.levelId = typeof filters.levelId === "string" 
      ? parseInt(filters.levelId) 
      : filters.levelId;
  }
  if (filters.industryId) {
    whereClause.industryId = typeof filters.industryId === "string"
      ? parseInt(filters.industryId)
      : filters.industryId;
  }
  if (filters.userId) {
    whereClause.userId = filters.userId;
  }
  if (filters.documentId) {
    whereClause.documentId = filters.documentId;
  }

  return whereClause;
};


export function getFlashcardSelect(userLanguage: Langs = "english") {
  return getLanguageSelect(userLanguage, {
    id: true,
    industryId: true,
    levelId: true,
  });
}


export const convertFlashcardToDisplayFormat = (dbFlashcard: any, language?: string) => {
  return convertToDisplayFormat(
    dbFlashcard,
    { language },
    {
      industry_id: dbFlashcard.industryId,
      level_id: dbFlashcard.levelId,
    }
  );
};


export const convertFlashcardToDisplayFormatAllLanguages = (dbFlashcard: any) => {
  return convertToDisplayFormat(
    dbFlashcard,
    { includeAllLanguages: true },
    {
      industry_id: dbFlashcard.industryId,
      level_id: dbFlashcard.levelId,
    }
  );
};

export const enrichFlashcard = (flashcard: any, language?: string) => {
  const lang = language?.toLowerCase() || 'english';
  
  return {
    ...convertFlashcardToDisplayFormat(flashcard, lang),
    industry: flashcard.industry?.name || "General",
    level: flashcard.level?.name || null,
  };
};


export const combineFlashcardsForPractice = (
  industryFlashcards: any[],
  generalFlashcards: any[]
): any[] => {
  return [...industryFlashcards, ...generalFlashcards].slice(0, 50);
};

export const calculateAvailableTerms = async (
  levelId: number,
  industryId: number | null
) => {
  let industryCount = 0;
  let generalCount = 0;

  if (industryId) {
    industryCount = await prisma.flashcard.count({
      where: {
        levelId,
        industryId,
      },
    });
  }

  const totalGeneralCount = await prisma.flashcard.count({
    where: {
      levelId,
      industryId: null,
    },
  });

  generalCount = Math.min(totalGeneralCount, Math.max(0, 50 - industryCount));
  const totalAvailable = industryCount + generalCount;

  return {
    industryCount,
    generalCount,
    totalGeneralCount,
    totalAvailable,
  };
};


export async function getFlashcardsByLevel(levelId: number, userLanguage: string = "english") {
  const lang = normalizeLanguage(userLanguage);
  
  const flashcards = await prisma.flashcard.findMany({
    where: { levelId },
    select: {
      ...getFlashcardSelect(lang),
      industry: {
        select: { name: true }
      },
      level: {
        select: { name: true }
      }
    },
  });

  return flashcards.map(fc => enrichFlashcard(fc, lang));
}


export async function getFlashcardsByIndustry(industryId: number, userLanguage: string = "english") {
  const lang = normalizeLanguage(userLanguage);
  
  const flashcards = await prisma.flashcard.findMany({
    where: { industryId },
    select: {
      ...getFlashcardSelect(lang),
      industry: {
        select: { name: true }
      },
      level: {
        select: { name: true }
      }
    },
  });

  return flashcards.map(fc => enrichFlashcard(fc, lang));
}


export async function getFlashcardsForPractice(
  levelId: number,
  industryId: number | null,
  userLanguage: string = "english"
) {
  const lang = normalizeLanguage(userLanguage);
  
  const industryFlashcards = industryId
    ? await prisma.flashcard.findMany({
        where: { levelId, industryId },
        select: {
          ...getFlashcardSelect(lang),
          industry: { select: { name: true } },
          level: { select: { name: true } }
        },
        take: 50,
      })
    : [];

  const remainingSlots = 50 - industryFlashcards.length;
  const generalFlashcards = remainingSlots > 0
    ? await prisma.flashcard.findMany({
        where: { levelId, industryId: null },
        select: {
          ...getFlashcardSelect(lang),
          industry: { select: { name: true } },
          level: { select: { name: true } }
        },
        take: remainingSlots,
      })
    : [];

  const combined = combineFlashcardsForPractice(industryFlashcards, generalFlashcards);
  return combined.map(fc => enrichFlashcard(fc, lang));
}


export async function getFlashcardAllLanguages(id: string) {
  const flashcard = await prisma.flashcard.findUnique({
    where: { id },
    select: {
      id: true,
      ...getAllLanguageFields(),
      industryId: true,
      levelId: true,
      industry: { select: { name: true } },
      level: { select: { name: true } }
    },
  });

  if (!flashcard) return null;
  
  return {
    ...convertFlashcardToDisplayFormatAllLanguages(flashcard),
    industry: flashcard.industry?.name || "General",
    level: flashcard.level?.name || null,
  };
}