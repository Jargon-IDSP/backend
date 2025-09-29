import * as fs from 'fs'
import * as path from 'path'
import type { flashcardJson, LevelData, IndustryData } from '../interfaces/flashcardData'


const dataDirectory = '../terms-jsons'

const prismaModule = await import('@prisma/client') as any
const { PrismaClient } = prismaModule
const prisma = new PrismaClient()

function loadJsonFile<T>(filePath: string, dataName: string): T[] {
  try {
    const absolutePath = path.resolve(filePath)
    console.log(`📁 Looking for ${dataName} at: ${absolutePath}`)
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ File not found: ${absolutePath}`)
      process.exit(1)
    }
    
    const fileContent = fs.readFileSync(absolutePath, 'utf8')
    const data = JSON.parse(fileContent)
    return Array.isArray(data) ? data : [data]
  } catch (error) {
    console.error(`❌ Error loading ${dataName} file:`, error)
    console.error('Make sure the file exists and contains valid JSON')
    process.exit(1)
  }
}

function loadAllFlashcardsFromDirectory(baseDir: string): flashcardJson[] {
  const allFlashcards: flashcardJson[] = []
  
  try {
    const absoluteBaseDir = path.resolve(baseDir)
    
    if (!fs.existsSync(absoluteBaseDir)) {
      console.error(`❌ Directory not found: ${absoluteBaseDir}`)
      process.exit(1)
    }
    
    const entries = fs.readdirSync(absoluteBaseDir, { withFileTypes: true })
    const industryFolders = entries.filter(entry => entry.isDirectory())
    
    console.log(`📂 Found ${industryFolders.length} industry folders`)
    
    for (const folder of industryFolders) {
      const folderPath = path.join(absoluteBaseDir, folder.name)
      console.log(`  📁 Processing ${folder.name}...`)
      
      const files = fs.readdirSync(folderPath)
        .filter(file => file.endsWith('.json'))
        .sort() 
      
      console.log(`     Found ${files.length} JSON files`)
      
      for (const file of files) {
        const filePath = path.join(folderPath, file)
        const fileData = loadJsonFile<flashcardJson>(filePath, `${folder.name}/${file}`)
        allFlashcards.push(...fileData)
        console.log(`     ✓ Loaded ${fileData.length} flashcards from ${file}`)
      }
    }
    
    console.log(`\n📚 Total flashcards loaded: ${allFlashcards.length}`)
    return allFlashcards
    
  } catch (error) {
    console.error('❌ Error loading flashcards from directories:', error)
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
    definitionKorean: jsonCard.definition.korean,
    industryId: jsonCard.industry_id,
    levelId: jsonCard.level_id
  }
}

async function importData() {
  try {
    console.log('🚀 Starting data import...')
    console.log('=' .repeat(60))
    
    const levelsFilePath = path.join(dataDirectory, 'levels.json')
    const industriesFilePath = path.join(dataDirectory, 'industries.json')
    
    console.log('\n📖 Loading metadata files...')
    const levelsData = loadJsonFile<LevelData>(levelsFilePath, 'levels')
    const industriesData = loadJsonFile<IndustryData>(industriesFilePath, 'industries')
    
    console.log(`✓ Loaded ${levelsData.length} levels`)
    console.log(`✓ Loaded ${industriesData.length} industries`)
    
    console.log('\n📖 Loading flashcards from all industry folders...')
    const flashcardsData = loadAllFlashcardsFromDirectory(dataDirectory)
    
    console.log('\n' + '='.repeat(60))
    console.log('🧹 Clearing existing data...')
    await prisma.question.deleteMany()
    console.log('✓ Cleared questions')
    await prisma.flashcard.deleteMany()
    console.log('✓ Cleared flashcards')
    await prisma.industry.deleteMany()
    console.log('✓ Cleared industries')
    await prisma.level.deleteMany()
    console.log('✓ Cleared levels')
    
    console.log('\n📊 Creating levels...')
    for (const level of levelsData) {
      await prisma.level.create({
        data: {
          id: level.id,
          name: level.name
        }
      })
      console.log(`  ✓ Created level: ${level.name}`)
    }
    
    console.log('\n🏭 Creating industries...')
    for (const industry of industriesData) {
      await prisma.industry.create({
        data: {
          id: industry.id,
          name: industry.name
        }
      })
      console.log(`  ✓ Created industry: ${industry.name}`)
    }
    
    const dbData = flashcardsData.map(transformForDB)
    
    console.log('\n📥 Importing flashcards...')
    console.log('This may take a moment...')
    
    const result = await prisma.flashcard.createMany({
      data: dbData
    })
    
    console.log(`✅ Successfully imported ${result.count} flashcards`)
    
    const total = await prisma.flashcard.count()
    const industryCount = await prisma.industry.count()
    const levelCount = await prisma.level.count()
    
    console.log('\n' + '='.repeat(60))
    console.log('📋 Import Summary:')
    console.log('='.repeat(60))
    console.log(`   Levels:      ${levelCount}`)
    console.log(`   Industries:  ${industryCount}`)
    console.log(`   Flashcards:  ${total}`)
    console.log('='.repeat(60))
    console.log('✅ Import completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Import failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

importData()