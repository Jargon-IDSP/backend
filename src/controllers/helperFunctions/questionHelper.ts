export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
};

export const getPromptForLanguage = (question: any, language: string): string => {
  const lang = language.toLowerCase();
  const langMap: { [key: string]: string } = {
    english: question.promptEnglish,
    french: question.promptFrench,
    chinese: question.promptChinese,
    spanish: question.promptSpanish,
    tagalog: question.promptTagalog,
    punjabi: question.promptPunjabi,
    korean: question.promptKorean,
  };
  return langMap[lang] || question.promptEnglish;
};

export const getTermForLanguage = (flashcard: any, language: string): string => {
  const lang = language.toLowerCase();
  const langMap: { [key: string]: string } = {
    english: flashcard.termEnglish,
    french: flashcard.termFrench,
    chinese: flashcard.termChinese,
    spanish: flashcard.termSpanish,
    tagalog: flashcard.termTagalog,
    punjabi: flashcard.termPunjabi,
    korean: flashcard.termKorean,
  };
  return langMap[lang] || flashcard.termEnglish;
};

export const getDefinitionForLanguage = (flashcard: any, language: string): string => {
  const lang = language.toLowerCase();
  const langMap: { [key: string]: string } = {
    english: flashcard.definitionEnglish,
    french: flashcard.definitionFrench,
    chinese: flashcard.definitionChinese,
    spanish: flashcard.definitionSpanish,
    tagalog: flashcard.definitionTagalog,
    punjabi: flashcard.definitionPunjabi,
    korean: flashcard.definitionKorean,
  };
  return langMap[lang] || flashcard.definitionEnglish;
};

export const getRandomWrongAnswers = async (
  prisma: any,
  correctTermId: string,
  count: number = 3,
  isCustom: boolean = false
) => {
  const model = isCustom ? prisma.customFlashcard : prisma.flashcard;
  
  const allFlashcards = await model.findMany({
    where: {
      id: {
        not: correctTermId,
      },
    },
  });
  
  const shuffled = shuffleArray(allFlashcards);
  return shuffled.slice(0, count);
};

export const formatChoices = (
  correctAnswer: any,
  wrongAnswers: any[],
  language: string = 'english'
) => {
  const allChoices = [
    {
      term: getTermForLanguage(correctAnswer, language),
      isCorrect: true,
      termId: correctAnswer.id,
    },
    ...wrongAnswers.map((answer) => ({
      term: getTermForLanguage(answer, language),
      isCorrect: false,
      termId: answer.id,
    })),
  ];
  
  const shuffledChoices = shuffleArray(allChoices);
  
  return shuffledChoices.map((choice, index) => ({
    ...choice,
    id: String.fromCharCode(65 + index), // A, B, C, D
  }));
};

export const enrichQuestion = (question: any, language?: string) => {
  const lang = language?.toLowerCase() || 'english';
  
  return {
    id: question.id,
    prompt: getPromptForLanguage(question, lang),
    difficulty: question.difficulty,
    tags: typeof question.tags === 'string' ? JSON.parse(question.tags) : question.tags,
    points: question.points,
    correctAnswer: {
      id: question.correctAnswer.id,
      term: getTermForLanguage(question.correctAnswer, lang),
      definition: getDefinitionForLanguage(question.correctAnswer, lang),
    },
  };
};

export const enrichCustomQuestion = (question: any, language?: string) => {
  const lang = language?.toLowerCase() || 'english';
  
  return {
    id: question.id,
    prompt: getPromptForLanguage(question, lang),
    correctAnswer: {
      id: question.correctAnswer.id,
      term: getTermForLanguage(question.correctAnswer, lang),
      definition: getDefinitionForLanguage(question.correctAnswer, lang),
    },
    createdAt: question.createdAt,
  };
};

export const enrichQuestionWithChoices = async (
  prisma: any,
  question: any,
  language: string = 'english',
  isCustom: boolean = false
) => {
  const wrongAnswers = await getRandomWrongAnswers(
    prisma,
    question.correctTermId,
    3,
    isCustom
  );
  
  const choices = formatChoices(question.correctAnswer, wrongAnswers, language);
  
  return {
    questionId: question.id,
    prompt: getPromptForLanguage(question, language),
    choices,
    difficulty: question.difficulty,
    tags: typeof question.tags === 'string' ? JSON.parse(question.tags) : question.tags,
    language,
    correctAnswerId: question.correctTermId,
  };
};