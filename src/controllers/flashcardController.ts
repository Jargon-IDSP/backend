import type { Context } from "hono";
const prismaModule = await import('@prisma/client') as any
const { PrismaClient } = prismaModule
import type { FlashcardWithRelations} from '../interfaces/flashcardData'



const prisma = new PrismaClient();

const convertToDisplayFormat = (dbFlashcard: any, language?: string) => {
  const result: any = {
    id: dbFlashcard.id,
    term: {
      english: dbFlashcard.termEnglish
    },
    definition: {
      english: dbFlashcard.definitionEnglish
    },
    industry_id: dbFlashcard.industryId,
    level_id: dbFlashcard.levelId
  };

  if (language) {
    result.term[language] = getTermByLanguage(dbFlashcard, language);
    result.definition[language] = getDefinitionByLanguage(dbFlashcard, language);
  }
  return result;
};

// Filtering functions

const getTermByLanguage = (dbFlashcard: any, language: string) => {
  const languageMap: { [key: string]: string } = {
    french: dbFlashcard.termFrench,
    mandarin: dbFlashcard.termMandarin,
    spanish: dbFlashcard.termSpanish,
    tagalog: dbFlashcard.termTagalog,
    punjabi: dbFlashcard.termPunjabi,
    korean: dbFlashcard.termKorean
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
    korean: dbFlashcard.definitionKorean
  };
  return languageMap[language];
};

export const getFlashcardsByLevel = async (c: Context) => {
  try {
    const levelId = c.req.param('levelId');
    const language = c.req.query('language');

    if (!levelId) {
      return c.json({
        success: false,
        error: 'Level ID is required'
      }, 400);
    }

    const flashcards = await prisma.flashcard.findMany({
      where: {
        levelId: parseInt(levelId)
      },
      include: {
        industry: true,
        level: true
      }
    });

    if (flashcards.length === 0) {
      return c.json({
        success: false,
        error: 'No flashcards found for this level'
      }, 404);
    }

    const displayFlashcards = flashcards.map((card: FlashcardWithRelations) => ({
      ...convertToDisplayFormat(card, language),
      industry: card.industry.name,
      level: card.level.name
    }));

    return c.json({
      success: true,
      count: flashcards.length,
      data: displayFlashcards,
      level_id: levelId
    });
  } catch (error) {
    console.error('Error fetching flashcards by level:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch flashcards by level'
    }, 500);
  }
};

export const getFlashcardsByIndustry = async (c: Context) => {
  try {
    const industryId = c.req.param('industryId');
    const language = c.req.query('language');

    if (!industryId) {
      return c.json({
        success: false,
        error: 'Industry ID is required'
      }, 400);
    }

    const flashcards = await prisma.flashcard.findMany({
      where: {
        industryId: parseInt(industryId)
      },
      include: {
        industry: true,
        level: true
      }
    });

    if (flashcards.length === 0) {
      return c.json({
        success: false,
        error: 'No flashcards found for this industry'
      }, 404);
    }

      const displayFlashcards = flashcards.map((card: FlashcardWithRelations) => ({
      ...convertToDisplayFormat(card, language),
      industry: card.industry.name,
      level: card.level.name
    }));

    return c.json({
      success: true,
      count: flashcards.length,
      data: displayFlashcards,
      industry_id: industryId
    });
  } catch (error) {
    console.error('Error fetching flashcards by industry:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch flashcards by industry'
    }, 500);
  }
};

// Retrieving all flashcards with optional filters

export const getFlashcards = async (c: Context) => {
  try {
    const language = c.req.query('language');
    const industryId = c.req.query('industry_id');
    const levelId = c.req.query('level_id');

    let whereClause: any = {};

    if (industryId) {
      whereClause.industryId = parseInt(industryId);
    }

    if (levelId) {
      whereClause.levelId = parseInt(levelId);
    }

    const flashcards = await prisma.flashcard.findMany({
      where: whereClause,
      include: {
        industry: true,
        level: true
      }
    });
    
    const displayFlashcards = flashcards.map((card: FlashcardWithRelations) => ({
      ...convertToDisplayFormat(card, language),
      industry: card.industry.name,
      level: card.level.name
    }));
    
    return c.json({
      success: true,
      count: flashcards.length,
      data: displayFlashcards,
      filters: {
        language,
        industry_id: industryId,
        level_id: levelId
      }
    });
  } catch (error) {
    console.error('Error fetching flashcards:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch flashcards'
    }, 500);
  }
};


export const getRandomFlashcard = async (c: Context) => {
  try {
    const language = c.req.query('language');
    const industryId = c.req.query('industry_id');
    const levelId = c.req.query('level_id');

    let whereClause: any = {};

    if (industryId) {
      whereClause.industryId = parseInt(industryId);
    }

    if (levelId) {
      whereClause.levelId = parseInt(levelId);
    }

    const totalCount = await prisma.flashcard.count({
      where: whereClause
    });
    
    if (totalCount === 0) {
      return c.json({
        success: false,
        error: 'No flashcards found'
      }, 404);
    }
    
    const randomOffset = Math.floor(Math.random() * totalCount);
    
    const randomFlashcard = await prisma.flashcard.findMany({
      where: whereClause,
      skip: randomOffset,
      take: 1,
      include: {
        industry: true,
        level: true
      }
    });
    
    if (!randomFlashcard || randomFlashcard.length === 0) {
      return c.json({
        success: false,
        error: 'No flashcard found'
      }, 404);
    }
    
    const languages = ['french', 'mandarin', 'spanish', 'tagalog', 'punjabi', 'korean'];
    const selectedLanguage = language || languages[Math.floor(Math.random() * languages.length)];
    
    const displayCard = {
      ...convertToDisplayFormat(randomFlashcard[0], selectedLanguage),
      industry: randomFlashcard[0].industry.name,
      level: randomFlashcard[0].level.name
    };
    
    return c.json({
      success: true,
      data: displayCard,
      selectedLanguage
    });
    
  } catch (error) {
    console.error('Error fetching random flashcard:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch random flashcard'
    }, 500);
  }
};

export const getIndustries = async (c: Context) => {
  try {
    const industries = await prisma.industry.findMany({
      include: {
        _count: {
          select: { flashcards: true }
        }
      }
    });

    return c.json({
      success: true,
      count: industries.length,
      data: industries
    });
  } catch (error) {
    console.error('Error fetching industries:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch industries'
    }, 500);
  }
};

export const getLevels = async (c: Context) => {
  try {
    const levels = await prisma.level.findMany({
      include: {
        _count: {
          select: { flashcards: true }
        }
      }
    });

    return c.json({
      success: true,
      count: levels.length,
      data: levels
    });
  } catch (error) {
    console.error('Error fetching levels:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch levels'
    }, 500);
  }
};