import * as fs from 'fs'
import * as path from 'path'

const dataDirectory = './terms-jsons'

const prismaModule = await import('@prisma/client') as any
const { PrismaClient } = prismaModule
const prisma = new PrismaClient()

interface QuestionJson {
  id: string
  correctTermId: string
  prompt: {
    english: string
    french: string
    chinese: string
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
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath}`)
      process.exit(1)
    }
    
    const fileContent = fs.readFileSync(absolutePath, 'utf8')
    const data = JSON.parse(fileContent)
    return Array.isArray(data) ? data : [data]
  } catch (error) {
    console.error('Error loading questions file:', error)
    process.exit(1)
  }
}

function transformQuestionForDB(jsonQuestion: QuestionJson) {
  return {
    id: jsonQuestion.id,
    correctTermId: jsonQuestion.correctTermId,
    promptEnglish: jsonQuestion.prompt.english,
    promptFrench: jsonQuestion.prompt.french,
    promptChinese: jsonQuestion.prompt.chinese,
    promptSpanish: jsonQuestion.prompt.spanish,
    promptTagalog: jsonQuestion.prompt.tagalog,
    promptPunjabi: jsonQuestion.prompt.punjabi,
    promptKorean: jsonQuestion.prompt.korean,
    difficulty: jsonQuestion.difficulty,
    tags: JSON.stringify(jsonQuestion.tags)
  }
}

async function importQuestions() {
  try {
    console.log('Starting questions import...\n')
    
    const questionsFilePath = path.join(dataDirectory, 'questions.json')
    const questionsData = loadQuestionsFromFile(questionsFilePath)
    
    console.log(`Loaded ${questionsData.length} questions\n`)
    
    const dbData = questionsData.map(transformQuestionForDB)
    
    console.log('Clearing existing questions...')
    await prisma.question.deleteMany()
    
    console.log('Importing questions...')
    const result = await prisma.question.createMany({ data: dbData })
    
    console.log(`\nImport completed successfully!`)
    console.log(`  Questions: ${result.count}`)
    
  } catch (error) {
    console.error('\nQuestions import failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

importQuestions()