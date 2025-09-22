export interface flashcardJson {
  id: string
  term: {
    english: string
    french: string
    mandarin: string
    spanish: string
    tagalog: string
    punjabi: string
    korean: string
  }
  definition: {
    english: string
    french: string
    mandarin: string
    spanish: string
    tagalog: string
    punjabi: string
    korean: string
  }
}

export interface FlashcardDisplay {
  id: string
  term: {
    english: string
    [key: string]: string 
  }
  definition: {
    english: string
    [key: string]: string
  }
}

export type Language = 'french' | 'mandarin' | 'spanish' | 'tagalog' | 'punjabi' | 'korean'