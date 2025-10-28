import type { Langs } from "../../interfaces/customFlashcard";

export const VALID_LANGUAGES: Langs[] = [
  "english",
  "french",
  "chinese",
  "spanish",
  "tagalog",
  "punjabi",
  "korean",
];

export function normalizeLanguage(language: string): Langs {
  const normalized = language.toLowerCase();

  if (VALID_LANGUAGES.includes(normalized as Langs)) {
    return normalized as Langs;
  }

  return "english";
}

export function getLanguageFieldName(
  fieldPrefix: string,
  language: Langs
): string {
  if (language === "english") {
    return `${fieldPrefix}English`;
  }
  const capitalizedLang = language.charAt(0).toUpperCase() + language.slice(1);
  return `${fieldPrefix}${capitalizedLang}`;
}

export function getLanguageValue(
  data: any,
  fieldPrefix: string,
  language: string
): string | undefined {
  const lang = normalizeLanguage(language);
  const fieldName = getLanguageFieldName(fieldPrefix, lang);
  return data[fieldName];
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

// ✅ REVERTED: Keep the original logic that was working
export function getLanguageSelect(
  userLanguage: Langs,
  baseFields: Record<string, boolean> = {}
) {
  const select: any = {
    ...baseFields,
    termEnglish: true,
    definitionEnglish: true,
  };

  // Add user's native language fields
  if (userLanguage !== "english") {
    const termField = getLanguageFieldName("term", userLanguage);
    const defField = getLanguageFieldName("definition", userLanguage);
    select[termField] = true;
    select[defField] = true;
  }

  return select;
}

interface ConvertOptions {
  language?: string;
  includeAllLanguages?: boolean;
}

interface BaseFlashcardData {
  id: string;
  termEnglish: string;
  definitionEnglish: string;
  termFrench?: string;
  termChinese?: string;
  termSpanish?: string;
  termTagalog?: string;
  termPunjabi?: string;
  termKorean?: string;
  definitionFrench?: string;
  definitionChinese?: string;
  definitionSpanish?: string;
  definitionTagalog?: string;
  definitionPunjabi?: string;
  definitionKorean?: string;
  [key: string]: any;
}

// ✅ ONLY FIX: Change the output format from nested to flat
export function convertToDisplayFormat(
  dbFlashcard: BaseFlashcardData,
  options: ConvertOptions = {},
  additionalFields: Record<string, any> = {}
) {
  const { language, includeAllLanguages = false } = options;
  const lang = normalizeLanguage(language || "english");

  const result: any = {
    id: dbFlashcard.id,
    ...additionalFields,
  };

  if (includeAllLanguages) {
    // For "all languages" mode, keep nested structure
    result.term = {
      english: dbFlashcard.termEnglish || "",
      french: dbFlashcard.termFrench || "",
      chinese: dbFlashcard.termChinese || "",
      spanish: dbFlashcard.termSpanish || "",
      tagalog: dbFlashcard.termTagalog || "",
      punjabi: dbFlashcard.termPunjabi || "",
      korean: dbFlashcard.termKorean || "",
    };
    result.definition = {
      english: dbFlashcard.definitionEnglish || "",
      french: dbFlashcard.definitionFrench || "",
      chinese: dbFlashcard.definitionChinese || "",
      spanish: dbFlashcard.definitionSpanish || "",
      tagalog: dbFlashcard.definitionTagalog || "",
      punjabi: dbFlashcard.definitionPunjabi || "",
      korean: dbFlashcard.definitionKorean || "",
    };
  } else {
    // ✅ CHANGED: Flat structure instead of nested
    // Always include English
    result.term = dbFlashcard.termEnglish || "";
    result.definition = dbFlashcard.definitionEnglish || "";

    // Add native language if not English
    if (lang !== "english") {
      const termField = getLanguageFieldName("term", lang);
      const defField = getLanguageFieldName("definition", lang);

      // Check if the fields exist in the data
      if (dbFlashcard[termField]) {
        result.nativeTerm = dbFlashcard[termField];
      }
      if (dbFlashcard[defField]) {
        result.nativeDefinition = dbFlashcard[defField];
      }
      result.language = lang;
    }
  }

  return result;
}

// import type { Langs } from "../../interfaces/customFlashcard";

// export const VALID_LANGUAGES: Langs[] = [
//   "english",
//   "french",
//   "chinese",
//   "spanish",
//   "tagalog",
//   "punjabi",
//   "korean",
// ];

// export function normalizeLanguage(language: string): Langs {
//   const normalized = language.toLowerCase();

//   if (VALID_LANGUAGES.includes(normalized as Langs)) {
//     return normalized as Langs;
//   }

//   return "english";
// }

// export function getLanguageFieldName(fieldPrefix: string, language: Langs): string {
//   if (language === "english") {
//     return `${fieldPrefix}English`;
//   }
//   const capitalizedLang = language.charAt(0).toUpperCase() + language.slice(1);
//   return `${fieldPrefix}${capitalizedLang}`;
// }

// export function getLanguageValue(
//   data: any,
//   fieldPrefix: string,
//   language: string
// ): string | undefined {
//   const lang = normalizeLanguage(language);
//   const fieldName = getLanguageFieldName(fieldPrefix, lang);
//   return data[fieldName];
// }

// export function getAllLanguageFields() {
//   return {
//     termEnglish: true,
//     termFrench: true,
//     termChinese: true,
//     termSpanish: true,
//     termTagalog: true,
//     termPunjabi: true,
//     termKorean: true,
//     definitionEnglish: true,
//     definitionFrench: true,
//     definitionChinese: true,
//     definitionSpanish: true,
//     definitionTagalog: true,
//     definitionPunjabi: true,
//     definitionKorean: true,
//   };
// }

// export function getLanguageSelect(userLanguage: Langs, baseFields: Record<string, boolean> = {}) {
//   const select: any = {
//     ...baseFields,
//     termEnglish: true,
//     definitionEnglish: true,
//   };

//   if (userLanguage !== "english") {
//     const termField = getLanguageFieldName("term", userLanguage);
//     const defField = getLanguageFieldName("definition", userLanguage);
//     select[termField] = true;
//     select[defField] = true;
//   }

//   return select;
// }

// interface ConvertOptions {
//   language?: string;
//   includeAllLanguages?: boolean;
// }

// interface BaseFlashcardData {
//   id: string;
//   termEnglish: string;
//   definitionEnglish: string;
//   termFrench?: string;
//   termChinese?: string;
//   termSpanish?: string;
//   termTagalog?: string;
//   termPunjabi?: string;
//   termKorean?: string;
//   definitionFrench?: string;
//   definitionChinese?: string;
//   definitionSpanish?: string;
//   definitionTagalog?: string;
//   definitionPunjabi?: string;
//   definitionKorean?: string;
//   [key: string]: any;
// }

// export function convertToDisplayFormat(
//   dbFlashcard: BaseFlashcardData,
//   options: ConvertOptions = {},
//   additionalFields: Record<string, any> = {}
// ) {
//   const { language, includeAllLanguages = false } = options;
//   const lang = normalizeLanguage(language || "english");

//   const result: any = {
//     id: dbFlashcard.id,
//     ...additionalFields,
//   };

//   if (includeAllLanguages) {
//     result.term = {
//       english: dbFlashcard.termEnglish || "",
//       french: dbFlashcard.termFrench || "",
//       chinese: dbFlashcard.termChinese || "",
//       spanish: dbFlashcard.termSpanish || "",
//       tagalog: dbFlashcard.termTagalog || "",
//       punjabi: dbFlashcard.termPunjabi || "",
//       korean: dbFlashcard.termKorean || "",
//     };
//     result.definition = {
//       english: dbFlashcard.definitionEnglish || "",
//       french: dbFlashcard.definitionFrench || "",
//       chinese: dbFlashcard.definitionChinese || "",
//       spanish: dbFlashcard.definitionSpanish || "",
//       tagalog: dbFlashcard.definitionTagalog || "",
//       punjabi: dbFlashcard.definitionPunjabi || "",
//       korean: dbFlashcard.definitionKorean || "",
//     };
//   } else {
//     result.term = {
//       english: dbFlashcard.termEnglish || "",
//     };
//     result.definition = {
//       english: dbFlashcard.definitionEnglish || "",
//     };

//     if (lang !== "english") {
//       const termField = getLanguageFieldName("term", lang);
//       const defField = getLanguageFieldName("definition", lang);

//       if (dbFlashcard[termField]) {
//         result.term[lang] = dbFlashcard[termField];
//       }
//       if (dbFlashcard[defField]) {
//         result.definition[lang] = dbFlashcard[defField];
//       }
//     }
//   }

//   return result;
// }
