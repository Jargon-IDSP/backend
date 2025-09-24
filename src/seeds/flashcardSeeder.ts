import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import type { flashcardJson } from '../interfaces/flashcardData'


const prisma = new PrismaClient()

function loadFlashcardsFromFile(filePath: string): flashcardJson[] {
try {
    const absolutePath = path.resolve(filePath)
    console.log(`📁 Looking for file at: ${absolutePath}`)
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ File not found: ${absolutePath}`)
      process.exit(1)
    }
    
    const fileContent = fs.readFileSync(absolutePath, 'utf8')
    const data = JSON.parse(fileContent)
    return Array.isArray(data) ? data : [data]
  } catch (error) {
    console.error('❌ Error loading JSON file:', error)
    console.error('Make sure the file exists and contains valid JSON')
    process.exit(1)
  }
}

function transformForDB(jsonCard: flashcardJson) {
  return {
    id: jsonCard.id,
    termEnglish: jsonCard.term.english,
    termFrench: jsonCard.term.french,
    termMandarin: jsonCard.term.mandarin,
    termSpanish: jsonCard.term.spanish,
    termTagalog: jsonCard.term.tagalog,
    termPunjabi: jsonCard.term.punjabi,
    termKorean: jsonCard.term.korean,
    definitionEnglish: jsonCard.definition.english,
    definitionFrench: jsonCard.definition.french,
    definitionMandarin: jsonCard.definition.mandarin,
    definitionSpanish: jsonCard.definition.spanish,
    definitionTagalog: jsonCard.definition.tagalog,
    definitionPunjabi: jsonCard.definition.punjabi,
    definitionKorean: jsonCard.definition.korean
  }
}

async function importData() {
  try {
    console.log('🚀 Starting data import...')
    
    const jsonFilePath = 'words.json' 
    console.log(`📖 Loading data from ${jsonFilePath}...`)
    const flashcardsData = loadFlashcardsFromFile(jsonFilePath)
    
    console.log(`📚 Found ${flashcardsData.length} flashcards to import`)
    
    const dbData = flashcardsData.map(transformForDB)
    
    console.log('🧹 Clearing existing data...')
    await prisma.flashcard.deleteMany()
    
    console.log('📥 Importing flashcards...')
    const result = await prisma.flashcard.createMany({
      data: dbData
    })
    
    console.log(`✅ Successfully imported ${result.count} flashcards`)
    
    const total = await prisma.flashcard.count()
    console.log(`📊 Total flashcards in database: ${total}`)
    
  } catch (error) {
    console.error('❌ Import failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

importData()