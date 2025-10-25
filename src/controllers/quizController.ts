import type { Context } from 'hono';
import {
  startQuizAttempt,
  recordQuizAnswer,
  getUserQuizAttempt,
  getUserQuizStats,
  getQuizAttempts,
  getUserInProgressAttempts,
  retryQuiz,
  getUserQuizHistory,
  getQuizWithLanguage,
  getQuizWithAnswers,
  getQuestionById,
  getQuestionAllLanguages,
  getQuizAllLanguages,
} from './helperFunctions/quizHelper';
import { getUserLanguageFromContext } from './helperFunctions/languageHelper';

export async function startAttempt(c: Context) {
  const userId = c.get('userId');
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { customQuizId } = await c.req.json();
    
    if (!customQuizId) {
      return c.json({ error: 'customQuizId is required' }, 400);
    }

    const attempt = await startQuizAttempt(userId, customQuizId);
    return c.json({ attempt }, 201);
  } catch (error) {
    console.error('Error starting quiz attempt:', error);
    return c.json({ error: 'Failed to start quiz attempt' }, 500);
  }
}

export async function getQuiz(c: Context) {
  const customQuizId = c.req.param('customQuizId');
  
  const userLanguage = await getUserLanguageFromContext(c);
  
  try {
    const quiz = await getQuizWithLanguage(customQuizId, userLanguage);
    
    if (!quiz) {
      return c.json({ error: 'Quiz not found' }, 404);
    }
    
    return c.json({ quiz, language: userLanguage });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    return c.json({ error: 'Failed to fetch quiz' }, 500);
  }
}

export async function translateQuiz(c: Context) {
  const customQuizId = c.req.param('customQuizId');
  
  try {
    const quiz = await getQuizAllLanguages(customQuizId);
    
    if (!quiz) {
      return c.json({ error: 'Quiz not found' }, 404);
    }
    
    return c.json({ quiz });
  } catch (error) {
    console.error('Error translating quiz:', error);
    return c.json({ error: 'Failed to translate quiz' }, 500);
  }
}

export async function getQuestion(c: Context) {
  const questionId = c.req.param('questionId');
  
  const userLanguage = await getUserLanguageFromContext(c);
  
  try {
    const question = await getQuestionById(questionId, userLanguage);
    
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }
    
    return c.json({ question });
  } catch (error) {
    console.error('Error fetching question:', error);
    return c.json({ error: 'Failed to fetch question' }, 500);
  }
}

export async function translateQuestion(c: Context) {
  const questionId = c.req.param('questionId');
  
  try {
    const question = await getQuestionAllLanguages(questionId);
    
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }
    
    return c.json({ question });
  } catch (error) {
    console.error('Error translating question:', error);
    return c.json({ error: 'Failed to translate question' }, 500);
  }
}


export async function submitAnswer(c: Context) {
  const userId = c.get('userId');
  const attemptId = c.req.param('attemptId');
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { questionId, answerId } = await c.req.json();
    
    if (!questionId || !answerId) {
      return c.json({ error: 'questionId and answerId are required' }, 400);
    }

    const result = await recordQuizAnswer(attemptId, questionId, answerId);
    return c.json(result);
  } catch (error) {
    console.error('Error submitting answer:', error);
    return c.json({ error: 'Failed to submit answer' }, 500);
  }
}

export async function getCurrentAttempt(c: Context) {
  const userId = c.get('userId');
  const customQuizId = c.req.param('customQuizId');
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const attempt = await getUserQuizAttempt(userId, customQuizId, true);
    return c.json({ attempt });
  } catch (error) {
    console.error('Error fetching current attempt:', error);
    return c.json({ error: 'Failed to fetch current attempt' }, 500);
  }
}

export async function getStats(c: Context) {
  const userId = c.get('userId');
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const stats = await getUserQuizStats(userId);
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching quiz stats:', error);
    return c.json({ error: 'Failed to fetch quiz stats' }, 500);
  }
}

export async function getAllAttempts(c: Context) {
  const customQuizId = c.req.param('customQuizId');
  
  try {
    const attempts = await getQuizAttempts(customQuizId);
    return c.json({ attempts });
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    return c.json({ error: 'Failed to fetch quiz attempts' }, 500);
  }
}

export async function getInProgressAttempts(c: Context) {
  const userId = c.get('userId');
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const attempts = await getUserInProgressAttempts(userId);
    return c.json({ attempts });
  } catch (error) {
    console.error('Error fetching in-progress attempts:', error);
    return c.json({ error: 'Failed to fetch in-progress attempts' }, 500);
  }
}

export async function retryAttempt(c: Context) {
  const userId = c.get('userId');
  const customQuizId = c.req.param('customQuizId');
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const attempt = await retryQuiz(userId, customQuizId);
    return c.json({ attempt }, 201);
  } catch (error) {
    console.error('Error retrying quiz:', error);
    return c.json({ error: 'Failed to retry quiz' }, 500);
  }
}

export async function getAttemptHistory(c: Context) {
  const userId = c.get('userId');
  const customQuizId = c.req.param('customQuizId');
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const history = await getUserQuizHistory(userId, customQuizId);
    return c.json(history);
  } catch (error) {
    console.error('Error fetching attempt history:', error);
    return c.json({ error: 'Failed to fetch attempt history' }, 500);
  }
}