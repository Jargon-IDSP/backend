import type { Context } from "hono";

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


export const getLanguageValue = (
  data: any,
  fieldPrefix: string,
  language: string
): string | undefined => {
  const lang = language.toLowerCase();
  
  const languageMap: { [key: string]: string } = {
    french: data[`${fieldPrefix}French`],
    chinese: data[`${fieldPrefix}Chinese`],
    spanish: data[`${fieldPrefix}Spanish`],
    tagalog: data[`${fieldPrefix}Tagalog`],
    punjabi: data[`${fieldPrefix}Punjabi`],
    korean: data[`${fieldPrefix}Korean`],
  };
  return languageMap[lang];
};

export const convertToDisplayFormat = (dbFlashcard: any, language?: string) => {
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

  if (language && language !== "english") {
    const termTranslation = getLanguageValue(dbFlashcard, "term", language);
    const defTranslation = getLanguageValue(dbFlashcard, "definition", language);
    
    if (termTranslation) result.term[language] = termTranslation;
    if (defTranslation) result.definition[language] = defTranslation;
  }

  return result;
};

export const enrichFlashcard = (flashcard: any, language?: string) => {
  const lang = language?.toLowerCase() || 'english';
  
  return {
    ...convertToDisplayFormat(flashcard, lang),
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
  prisma: any,
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

// Custom flashcard helpers

export const convertCustomToDisplayFormat = (dbFlashcard: any, language?: string) => {
  const result: any = {
    id: dbFlashcard.id,
    documentId: dbFlashcard.documentId,
    userId: dbFlashcard.userId,
    term: {
      english: dbFlashcard.termEnglish,
    },
    definition: {
      english: dbFlashcard.definitionEnglish,
    },
  };

  if (language && language !== "english") {
    const termTranslation = getLanguageValue(dbFlashcard, "term", language);
    const defTranslation = getLanguageValue(dbFlashcard, "definition", language);
    
    if (termTranslation) result.term[language] = termTranslation;
    if (defTranslation) result.definition[language] = defTranslation;
  }

  return result;
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