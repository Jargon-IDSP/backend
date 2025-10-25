import type { Context } from "hono";
import { prisma } from "../../lib/prisma";
import type { Langs } from "../../interfaces/customFlashcard";


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

export function normalizeLanguage(language: string): Langs {
  const normalized = language.toLowerCase();
  const validLanguages: Langs[] = ["english", "french", "chinese", "spanish", "tagalog", "punjabi", "korean"];
  
  if (validLanguages.includes(normalized as Langs)) {
    return normalized as Langs;
  }
  
  return "english";
}

export function getLanguageFieldName(fieldPrefix: string, language: Langs): string {
  if (language === "english") {
    return `${fieldPrefix}English`;
  }
  const capitalizedLang = language.charAt(0).toUpperCase() + language.slice(1);
  return `${fieldPrefix}${capitalizedLang}`;
}

export const getLanguageValue = (
  data: any,
  fieldPrefix: string,
  language: string
): string | undefined => {
  const lang = normalizeLanguage(language);
  const fieldName = getLanguageFieldName(fieldPrefix, lang);
  return data[fieldName];
};


export function getFlashcardSelect(userLanguage: Langs = "english") {
  const select: any = {
    id: true,
    termEnglish: true,
    definitionEnglish: true,
    industryId: true,
    levelId: true,
  };

  if (userLanguage !== "english") {
    const termField = getLanguageFieldName("term", userLanguage);
    const defField = getLanguageFieldName("definition", userLanguage);
    select[termField] = true;
    select[defField] = true;
  }

  return select;
}


export function getCustomFlashcardSelect(userLanguage: Langs = "english") {
  const select: any = {
    id: true,
    termEnglish: true,
    definitionEnglish: true,
    documentId: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  };

  if (userLanguage !== "english") {
    const termField = getLanguageFieldName("term", userLanguage);
    const defField = getLanguageFieldName("definition", userLanguage);
    select[termField] = true;
    select[defField] = true;
  }

  return select;
}

export function getAllLanguageFields() {
  return {
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
  };
}

export const convertToDisplayFormat = (dbFlashcard: any, language?: string) => {
  const lang = normalizeLanguage(language || "english");
  
  const result: any = {
    id: dbFlashcard.id,
    term: {
      english: dbFlashcard.termEnglish || "",
    },
    definition: {
      english: dbFlashcard.definitionEnglish || "",
    },
    industry_id: dbFlashcard.industryId,
    level_id: dbFlashcard.levelId,
  };

  if (lang !== "english") {
    const termField = getLanguageFieldName("term", lang);
    const defField = getLanguageFieldName("definition", lang);
    
    if (dbFlashcard[termField]) {
      result.term[lang] = dbFlashcard[termField];
    }
    if (dbFlashcard[defField]) {
      result.definition[lang] = dbFlashcard[defField];
    }
  }

  return result;
};

export const convertToDisplayFormatAllLanguages = (dbFlashcard: any) => {
  return {
    id: dbFlashcard.id,
    term: {
      english: dbFlashcard.termEnglish || "",
      french: dbFlashcard.termFrench || "",
      chinese: dbFlashcard.termChinese || "",
      spanish: dbFlashcard.termSpanish || "",
      tagalog: dbFlashcard.termTagalog || "",
      punjabi: dbFlashcard.termPunjabi || "",
      korean: dbFlashcard.termKorean || "",
    },
    definition: {
      english: dbFlashcard.definitionEnglish || "",
      french: dbFlashcard.definitionFrench || "",
      chinese: dbFlashcard.definitionChinese || "",
      spanish: dbFlashcard.definitionSpanish || "",
      tagalog: dbFlashcard.definitionTagalog || "",
      punjabi: dbFlashcard.definitionPunjabi || "",
      korean: dbFlashcard.definitionKorean || "",
    },
    industry_id: dbFlashcard.industryId,
    level_id: dbFlashcard.levelId,
  };
};


export const enrichFlashcard = (flashcard: any, language?: string) => {
  const lang = language?.toLowerCase() || 'english';
  
  return {
    ...convertToDisplayFormat(flashcard, lang),
    industry: flashcard.industry?.name || "General",
    level: flashcard.level?.name || null,
  };
};

export const convertCustomToDisplayFormat = (dbFlashcard: any, language?: string) => {
  const lang = normalizeLanguage(language || "english");
  
  const result: any = {
    id: dbFlashcard.id,
    documentId: dbFlashcard.documentId,
    userId: dbFlashcard.userId,
    term: {
      english: dbFlashcard.termEnglish || "",
    },
    definition: {
      english: dbFlashcard.definitionEnglish || "",
    },
  };

  if (lang !== "english") {
    const termField = getLanguageFieldName("term", lang);
    const defField = getLanguageFieldName("definition", lang);
    
    if (dbFlashcard[termField]) {
      result.term[lang] = dbFlashcard[termField];
    }
    if (dbFlashcard[defField]) {
      result.definition[lang] = dbFlashcard[defField];
    }
  }

  return result;
};

export const convertCustomToDisplayFormatAllLanguages = (dbFlashcard: any) => {
  return {
    id: dbFlashcard.id,
    documentId: dbFlashcard.documentId,
    userId: dbFlashcard.userId,
    term: {
      english: dbFlashcard.termEnglish || "",
      french: dbFlashcard.termFrench || "",
      chinese: dbFlashcard.termChinese || "",
      spanish: dbFlashcard.termSpanish || "",
      tagalog: dbFlashcard.termTagalog || "",
      punjabi: dbFlashcard.termPunjabi || "",
      korean: dbFlashcard.termKorean || "",
    },
    definition: {
      english: dbFlashcard.definitionEnglish || "",
      french: dbFlashcard.definitionFrench || "",
      chinese: dbFlashcard.definitionChinese || "",
      spanish: dbFlashcard.definitionSpanish || "",
      tagalog: dbFlashcard.definitionTagalog || "",
      punjabi: dbFlashcard.definitionPunjabi || "",
      korean: dbFlashcard.definitionKorean || "",
    },
  };
};

export const enrichCustomFlashcard = (flashcard: any, language?: string) => {
  const lang = language?.toLowerCase() || 'english';
  
  return {
    ...convertCustomToDisplayFormat(flashcard, lang),
    document: flashcard.document
      ? {
          id: flashcard.document.id,
          filename: flashcard.document.filename,
          fileUrl: flashcard.document.fileUrl,
        }
      : null,
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
    ...convertToDisplayFormatAllLanguages(flashcard),
    industry: flashcard.industry?.name || "General",
    level: flashcard.level?.name || null,
  };
}


export async function getCustomFlashcardAllLanguages(id: string) {
  const flashcard = await prisma.customFlashcard.findUnique({
    where: { id },
    select: {
      id: true,
      ...getAllLanguageFields(),
      documentId: true,
      userId: true,
      document: {
        select: {
          id: true,
          filename: true,
          fileUrl: true,
        }
      }
    },
  });

  if (!flashcard) return null;
  
  return {
    ...convertCustomToDisplayFormatAllLanguages(flashcard),
    document: flashcard.document,
  };
}