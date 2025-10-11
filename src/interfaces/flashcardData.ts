import type { Flashcard, Industry, Level, CustomFlashcard, Document } from '@prisma/client'

export interface flashcardJson {
  id: string
  term: {
    english: string
    french: string
    chinese: string
    spanish: string
    tagalog: string
    punjabi: string
    korean: string
  }
  definition: {
    english: string
    french: string
    chinese: string
    spanish: string
    tagalog: string
    punjabi: string
    korean: string
  }
  industry_id?: number
  level_id: number
}

export interface CustomFlashcard {
  id: string
  documentId: string
  userId: string
  term: {
    english: string
    french: string
    chinese: string
    spanish: string
    tagalog: string
    punjabi: string
    korean: string
  }
  definition: {
    english: string
    french: string
    chinese: string
    spanish: string
    tagalog: string
    punjabi: string
    korean: string
  }
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

export interface CustomFlashcardDisplay {
  id: string
  documentId: string
  userId: string
  term: {
    english: string
    [key: string]: string 
  }
  definition: {
    english: string
    [key: string]: string
  }
}

export interface Document {
id: string
  filename: string
  fileKey: string
  fileUrl: string
  fileType: string
  fileSize: number | null
  userId: string
  quizId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DocumentDisplay {
  id: string
  filename: string
  fileUrl: string
  fileType: string
  fileSize: number | null
  createdAt: Date
}

export type DocumentWithFlashcards = Document & {
  flashcards: CustomFlashcard[]
}

export type DocumentWithFullFlashcards = Document & {
  flashcards: CustomFlashcardWithRelations[]
}

export type Language = 'french' | 'chinese' | 'spanish' | 'tagalog' | 'punjabi' | 'korean'

export type FlashcardWithRelations = Flashcard & {
  industry: Industry
  level: Level
}

export type CustomFlashcardWithRelations = CustomFlashcard & {
  document: Document
}