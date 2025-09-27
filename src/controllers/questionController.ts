import type { Context } from "hono";

// Dynamic import to avoid TypeScript module resolution issues
const prismaModule = await import('@prisma/client') as any
const { PrismaClient } = prismaModule
const prisma = new PrismaClient()

// Helper function to get random wrong answers
async function getRandomWrongAnswers(correctTermId: string, count: number = 3) {
  const allFlashcards = await prisma.flashcard.findMany({
    where: {
      id: {
        not: correctTermId // Exclude the correct answer
      }
    }
  });
  
  // Shuffle and take the requested number
  const shuffled = allFlashcards.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Helper function to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

// Helper function to format choices for display
function formatChoices(correctAnswer: any, wrongAnswers: any[], language: string = 'english') {
  // Create all choices without IDs first
  const allChoices = [
    {
      term: correctAnswer[`term${language.charAt(0).toUpperCase() + language.slice(1)}`],
      isCorrect: true,
      termId: correctAnswer.id
    },
    ...wrongAnswers.map((answer) => ({
      term: answer[`term${language.charAt(0).toUpperCase() + language.slice(1)}`],
      isCorrect: false,
      termId: answer.id
    }))
  ];
  
  // Shuffle the choices
  const shuffledChoices = shuffleArray(allChoices);
  
  // Assign IDs A, B, C, D after shuffling
  return shuffledChoices.map((choice, index) => ({
    ...choice,
    id: String.fromCharCode(65 + index) // A, B, C, D
  }));
}

// Get a random quiz question with multiple choice options
export const getRandomQuestion = async (c: Context) => {
  try {
    const language = c.req.query('language') || 'english';
    
    // Get total count for random selection
    const totalQuestions = await prisma.question.count();
    
    if (totalQuestions === 0) {
      return c.json({
        success: false,
        error: 'No questions found'
      }, 404);
    }
    
    // Get random question
    const randomOffset = Math.floor(Math.random() * totalQuestions);
    const question = await prisma.question.findMany({
      skip: randomOffset,
      take: 1,
      include: {
        correctAnswer: true
      }
    });
    
    if (!question || question.length === 0) {
      return c.json({
        success: false,
        error: 'No question found'
      }, 404);
    }
    
    const selectedQuestion = question[0];
    
    // Get 3 random wrong answers
    const wrongAnswers = await getRandomWrongAnswers(selectedQuestion.correctTermId, 3);
    
    // Format the choices
    const choices = formatChoices(selectedQuestion.correctAnswer, wrongAnswers, language);
    
    // Format the response
    const response = {
      success: true,
      data: {
        questionId: selectedQuestion.id,
        prompt: selectedQuestion[`prompt${language.charAt(0).toUpperCase() + language.slice(1)}`],
        choices: choices,
        difficulty: selectedQuestion.difficulty,
        tags: JSON.parse(selectedQuestion.tags),
        language: language,
        correctAnswerId: selectedQuestion.correctTermId
      }
    };
    
    return c.json(response);
    
  } catch (error) {
    console.error('Error fetching random question:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch random question'
    }, 500);
  }
};
