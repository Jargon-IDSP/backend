import * as fs from 'fs'
import * as path from 'path'
import type { flashcardJson, LevelData, IndustryData } from '../interfaces/flashcardData'

const dataDirectory = './terms-jsons'

const prismaModule = await import('@prisma/client') as any
const { PrismaClient } = prismaModule
const prisma = new PrismaClient()

function loadJsonFile<T>(filePath: string, dataName: string): T[] {
  try {
    const absolutePath = path.resolve(filePath)
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath}`)
      process.exit(1)
    }
    
    const fileContent = fs.readFileSync(absolutePath, 'utf8')
    const data = JSON.parse(fileContent)
    return Array.isArray(data) ? data : [data]
  } catch (error) {
    console.error(`Error loading ${dataName}:`, error)
    process.exit(1)
  }
}

function loadAllFlashcardsFromDirectory(baseDir: string): flashcardJson[] {
  const allFlashcards: flashcardJson[] = []
  
  try {
    const absoluteBaseDir = path.resolve(baseDir)
    
    if (!fs.existsSync(absoluteBaseDir)) {
      console.error(`Directory not found: ${absoluteBaseDir}`)
      process.exit(1)
    }
    
    const entries = fs.readdirSync(absoluteBaseDir, { withFileTypes: true })
    const industryFolders = entries.filter(entry => 
      entry.isDirectory() && entry.name !== '.git' 
    )
    
    for (const folder of industryFolders) {
      const folderPath = path.join(absoluteBaseDir, folder.name)
      const files = fs.readdirSync(folderPath)
        .filter(file => file.endsWith('.json'))
        .sort()
      
      for (const file of files) {
        const filePath = path.join(folderPath, file)
        const fileData = loadJsonFile<flashcardJson>(filePath, `${folder.name}/${file}`)
        allFlashcards.push(...fileData)
      }
    }
    
    return allFlashcards
    
  } catch (error) {
    console.error('Error loading flashcards:', error)
    process.exit(1)
  }
}

function transformForDB(jsonCard: flashcardJson) {
  return {
    id: jsonCard.id,
    termEnglish: jsonCard.term.english,
    termFrench: jsonCard.term.french,
    termChinese: jsonCard.term.chinese,
    termSpanish: jsonCard.term.spanish,
    termTagalog: jsonCard.term.tagalog,
    termPunjabi: jsonCard.term.punjabi,
    termKorean: jsonCard.term.korean,
    definitionEnglish: jsonCard.definition.english,
    definitionFrench: jsonCard.definition.french,
    definitionChinese: jsonCard.definition.chinese,
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
    console.log('Starting data import...\n')
    
    const levelsFilePath = path.join(dataDirectory, 'levels.json')
    const industriesFilePath = path.join(dataDirectory, 'industries.json')
    
    const levelsData = loadJsonFile<LevelData>(levelsFilePath, 'levels')
    const industriesData = loadJsonFile<IndustryData>(industriesFilePath, 'industries')
    const flashcardsData = loadAllFlashcardsFromDirectory(dataDirectory)
    
    console.log(`Loaded ${levelsData.length} levels, ${industriesData.length} industries, ${flashcardsData.length} flashcards\n`)

    // Validate data
    const missingLevelId = flashcardsData.filter(card => !card.level_id)
    if (missingLevelId.length > 0) {
      console.error(`Found ${missingLevelId.length} flashcards missing level_id:`)
      missingLevelId.forEach(card => console.log(`  - ID: ${card.id}`))
      process.exit(1)
    }

    const ids = flashcardsData.map(card => card.id)
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)]
      console.error(`Found duplicate IDs:`)
      uniqueDuplicates.forEach(dupId => {
        const cards = flashcardsData.filter(card => card.id === dupId)
        console.log(`  ID "${dupId}" appears ${cards.length} times`)
      })
      process.exit(1)
    }

    const validIndustryIds = industriesData.map(i => i.id)
    const validLevelIds = levelsData.map(l => l.id)
    
    const invalidIndustry = flashcardsData.filter(card => 
      card.industry_id === null && !validIndustryIds.includes(card.industry_id)
    )
  const invalidLevel = flashcardsData.filter(card => 
  !validLevelIds.includes(card.level_id)
)

if (invalidLevel.length > 0) {
  console.error(`Found ${invalidLevel.length} flashcards with invalid level_id:`)
  invalidLevel.forEach(card => {
    console.log(`  - ID: ${card.id}, Term: ${card.term.english}, Level ID: ${card.level_id}`)
  })
}

    console.log('Clearing existing data...')
    await prisma.question.deleteMany()
    await prisma.flashcard.deleteMany()
    await prisma.industry.deleteMany()
    await prisma.level.deleteMany()
    
    console.log('Creating levels and industries...')
    for (const level of levelsData) {
      await prisma.level.create({ data: { id: level.id, name: level.name } })
    }
    
    for (const industry of industriesData) {
      await prisma.industry.create({ data: { id: industry.id, name: industry.name } })
    }
    
    console.log('Importing flashcards...')
    const dbData = flashcardsData.map(transformForDB)
    const result = await prisma.flashcard.createMany({ data: dbData })
    
    console.log(`\nImport completed successfully!`)
    console.log(`  Levels: ${levelsData.length}`)
    console.log(`  Industries: ${industriesData.length}`)
    console.log(`  Flashcards: ${result.count}`)
    
  } catch (error) {
    console.error('\nImport failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

importData()