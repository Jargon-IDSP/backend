import { Hono } from 'hono';

// Language codes for common languages
const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  zh: 'Chinese',
  ko: 'Korean',
  pa: 'Punjabi',
};

// Simple translation dictionary for common construction tools
const TOOL_TRANSLATIONS: Record<string, Record<string, string>> = {
  'hammer': {
    es: 'Martillo', fr: 'Marteau', zh: '锤子', ko: '망치', pa: 'ਹਥੌੜਾ'
  },
  'screwdriver': {
    es: 'Destornillador', fr: 'Tournevis', zh: '螺丝刀', ko: '드라이버', pa: 'ਸਕਰੂ ਡਰਾਈਵਰ'
  },
  'wrench': {
    es: 'Llave', fr: 'Clé', zh: '扳手', ko: '렌치', pa: 'ਰਿੰਚ'
  },
  'knife': {
    es: 'Cuchillo', fr: 'Couteau', zh: '刀', ko: '나이프', pa: 'ਚਾਕੂ'
  },
  'scissors': {
    es: 'Tijeras', fr: 'Ciseaux', zh: '剪刀', ko: '가위', pa: 'ਕੈਂਚੀ'
  },
  'pliers': {
    es: 'Alicates', fr: 'Pinces', zh: '钳子', ko: '펜치', pa: 'ਚਿਮਟੀ'
  },
  'drill': {
    es: 'Taladro', fr: 'Perceuse', zh: '钻头', ko: '드릴', pa: 'ਡ੍ਰਿਲ'
  },
  'saw': {
    es: 'Sierra', fr: 'Scie', zh: '锯', ko: '톱', pa: 'ਆਰੀ'
  },
  'axe': {
    es: 'Hacha', fr: 'Hache', zh: '斧头', ko: '도끼', pa: 'ਕੁਹਾੜੀ'
  },
  'shovel': {
    es: 'Pala', fr: 'Pelle', zh: '铲子', ko: '삽', pa: 'ਫਾਵੜਾ'
  },
  'rake': {
    es: 'Rastrillo', fr: 'Râteau', zh: '耙子', ko: '갈퀴', pa: 'ਕੁਦਾਲ'
  },
  'paintbrush': {
    es: 'Pincel', fr: 'Pinceau', zh: '画笔', ko: '붓', pa: 'ਬਰੁਸ਼'
  },
  'brush': {
    es: 'Cepillo', fr: 'Brosse', zh: '刷子', ko: '브러시', pa: 'ਬਰੁਸ਼'
  }
};

// Simple translation function
function translateTool(toolName: string, targetLanguage: string): string {
  const normalizedName = toolName.toLowerCase().trim();
  
  // Check if we have a translation for this tool
  if (TOOL_TRANSLATIONS[normalizedName] && TOOL_TRANSLATIONS[normalizedName][targetLanguage]) {
    return TOOL_TRANSLATIONS[normalizedName][targetLanguage];
  }
  
  // If no translation found, return English name
  return toolName;
}

export const translateRoute = new Hono();

// Translation endpoint - uses local dictionary
translateRoute.post('/translate-tool', async (c) => {
  try {
    const body = await c.req.json();
    const { toolName, targetLanguage = 'en' } = body;

    if (!toolName) {
      return c.json({ error: 'No tool name provided' }, 400);
    }

    // If English, no translation needed
    if (targetLanguage === 'en') {
      return c.json({
        translated: toolName,
        language: 'English',
        languageCode: 'en',
        allLanguages: Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
          code,
          name,
        })),
      });
    }

    if (!SUPPORTED_LANGUAGES[targetLanguage]) {
      return c.json({ error: 'Unsupported language' }, 400);
    }

    // Translate using local dictionary
    const translatedName = translateTool(toolName, targetLanguage);

    return c.json({
      translated: translatedName,
      language: SUPPORTED_LANGUAGES[targetLanguage],
      languageCode: targetLanguage,
      allLanguages: Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
        code,
        name,
      })),
    });
  } catch (error: any) {
    console.error('Error translating tool:', error);
    return c.json(
      {
        error: 'Failed to translate tool name',
        message: error.message || 'Unknown error',
        allLanguages: Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
          code,
          name,
        })),
      },
      500
    );
  }
});

