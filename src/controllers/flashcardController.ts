import type { Context } from "hono";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const convertToDisplayFormat = (dbFlashcard: any, language?: string) => {
  const result: any = {
    id: dbFlashcard.id,
    term: {
      english: dbFlashcard.termEnglish
    },
    definition: {
      english: dbFlashcard.definitionEnglish
    }
  };

    if (language) {
      result.term[language] = getTermByLanguage(dbFlashcard, language);
      result.definition[language] = getDefinitionByLanguage(dbFlashcard, language);
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


export const getFlashcards = async (c: Context) => {
  try {
    const language = c.req.query('language');
    const role = c.req.query('role');

    let whereClause: any = {};

    if (role) {
      whereClause.role = role;
    }

    const flashcards = await prisma.flashcard.findMany({
      where: whereClause,
    });
    
    const displayFlashcards = flashcards.map(card => 
      convertToDisplayFormat(card, language)
    );
    
    return c.json({
      success: true,
      count: flashcards.length,
      data: displayFlashcards,
      filters: {
        language,
        role,
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
    const totalCount = await prisma.flashcard.count();
    
    if (totalCount === 0) {
      return c.json({
        success: false,
        error: 'No flashcards found'
      }, 404);
    }
    
    const randomOffset = Math.floor(Math.random() * totalCount);
    
    const randomFlashcard = await prisma.flashcard.findMany({
      skip: randomOffset,
      take: 1
    });
    
    if (!randomFlashcard || randomFlashcard.length === 0) {
      return c.json({
        success: false,
        error: 'No flashcard found'
      }, 404);
    }
    
    const languages = ['french', 'mandarin', 'spanish', 'tagalog', 'punjabi', 'korean'];
    
    const randomLanguage = languages[Math.floor(Math.random() * languages.length)];
    
    const displayCard = convertToDisplayFormat(randomFlashcard[0], randomLanguage);
    
    return c.json({
      success: true,
      data: displayCard,
      selectedLanguage: randomLanguage
    });
    
  } catch (error) {
    console.error('Error fetching random flashcard:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch random flashcard'
    }, 500);
  }
};