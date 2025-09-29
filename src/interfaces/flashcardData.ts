import type { Flashcard, Industry, Level } from '@prisma/client'

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
  industry_id: number
  level_id: number
}

export interface LevelData {
  id: number
  level_number: number
  name: string
}

export interface IndustryData {
  id: number
  name: string
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
  industry_id: number
  level_id: number
}



export type Language = 'french' | 'mandarin' | 'spanish' | 'tagalog' | 'punjabi' | 'korean'

export type FlashcardWithRelations = Flashcard & {
  industry: Industry
  level: Level
}