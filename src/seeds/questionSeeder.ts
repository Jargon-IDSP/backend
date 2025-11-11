import * as fs from 'fs'
import * as path from 'path'

const dataDirectory = './jargon-terms'

const prismaModule = await import('@prisma/client') as any
const { PrismaClient } = prismaModule
import { prisma } from '../lib/prisma';

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

function loadAllQuestionsFromDirectory(baseDir: string): QuestionJson[] {
  const allQuestions: QuestionJson[] = []
  
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
        .filter(file => file.includes('-questions') && file.endsWith('.json'))
        .sort()
      
      for (const file of files) {
        const filePath = path.join(folderPath, file)
        const fileData = loadQuestionsFromFile(filePath)
        allQuestions.push(...fileData)
      }
    }
    
    return allQuestions
    
  } catch (error) {
    console.error('Error loading questions:', error)
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
    
    const questionsData = loadAllQuestionsFromDirectory(dataDirectory)
    
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