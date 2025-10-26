import type { Context, Next } from 'hono';
import { prisma } from '../lib/prisma';
import { normalizeLanguage } from '../controllers/helperFunctions/languageHelper';

declare module "hono" {
  interface ContextVariableMap {
    userLanguage: string;
    userIndustry: number | null;
  }
}

export async function userContextMiddleware(c: Context, next: Next) {
  try {
    const userId = c.get('user')?.id;
    
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          language: true,
          industryId: true 
        }
      });
      
      c.set('userLanguage', normalizeLanguage(user?.language || 'english'));
      c.set('userIndustry', user?.industryId || null);
    } else {
      c.set('userLanguage', 'english');
      c.set('userIndustry', null);
    }
  } catch (error) {
    console.error('Error fetching user context:', error);
    c.set('userLanguage', 'english');
    c.set('userIndustry', null);
  }
  
  await next();
}