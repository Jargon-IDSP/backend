import * as fs from 'fs'
import * as path from 'path'

const prismaModule = await import('@prisma/client') as any
const { PrismaClient } = prismaModule
const prisma = new PrismaClient()

interface QuestionJson {
  id: string
  correctTermId: string
  prompt: {
    english: string
    french: string
    mandarin: string
    spanish: string
    tagalog: string
    punjabi: string
    korean: string
  }
  difficulty: number
  tags: string[]
}

function loadQuestionsFromFile(filePath: string): QuestionJson[] {
  try {
    const absolutePath = path.resolve(filePath)
    console.log(`📁 Looking for questions file at: ${absolutePath}`)
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ File not found: ${absolutePath}`)
      process.exit(1)
    }
    
    const fileContent = fs.readFileSync(absolutePath, 'utf8')
    const data = JSON.parse(fileContent)
    return Array.isArray(data) ? data : [data]
  } catch (error) {
    console.error('❌ Error loading questions JSON file:', error)
    console.error('Make sure the file exists and contains valid JSON')
    process.exit(1)
  }
}

function transformQuestionForDB(jsonQuestion: QuestionJson) {
  return {
    id: jsonQuestion.id,
    correctTermId: jsonQuestion.correctTermId,
    promptEnglish: jsonQuestion.prompt.english,
    promptFrench: jsonQuestion.prompt.french,
    promptMandarin: jsonQuestion.prompt.mandarin,
    promptSpanish: jsonQuestion.prompt.spanish,
    promptTagalog: jsonQuestion.prompt.tagalog,
    promptPunjabi: jsonQuestion.prompt.punjabi,
    promptKorean: jsonQuestion.prompt.korean,
    difficulty: jsonQuestion.difficulty,
    tags: JSON.stringify(jsonQuestion.tags) // Store tags as JSON string
  }
}

async function importQuestions() {
  try {
    console.log('🚀 Starting questions import...')
    
    const jsonFilePath = 'questions.json' 
    console.log(`📖 Loading questions from ${jsonFilePath}...`)
    const questionsData = loadQuestionsFromFile(jsonFilePath)
    
    console.log(`📚 Found ${questionsData.length} questions to import`)
    
    const dbData = questionsData.map(transformQuestionForDB)
    
    console.log('🧹 Clearing existing questions...')
    // Questions can be deleted independently
    await prisma.question.deleteMany()
    
    console.log('📥 Importing questions...')
    const result = await prisma.question.createMany({
      data: dbData
    })
    
    console.log(`✅ Successfully imported ${result.count} questions`)
    
    const total = await prisma.question.count()
    console.log(`📊 Total questions in database: ${total}`)
    
  } catch (error) {
    console.error('❌ Questions import failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

importQuestions()
