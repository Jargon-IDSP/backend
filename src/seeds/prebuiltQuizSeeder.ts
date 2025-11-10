import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { prisma } from '../lib/prisma';
import type { QuizTemplateData } from '../interfaces/badgeData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDirectory = path.join(__dirname, '../../jargon-terms');

function loadJsonFile<T>(filePath: string): T {
  try {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error);
    process.exit(1);
  }
}

export async function seedPrebuiltQuizzes() {
  console.log('🎯 Starting prebuilt quiz seeding...');

  try {
    // Load quiz templates
    const templatesPath = path.join(dataDirectory, 'quiz-templates.json');
    const templates = loadJsonFile<QuizTemplateData[]>(templatesPath);

    console.log(`📚 Loaded ${templates.length} quiz templates`);

    // Get all industries (including null for general)
    const industries = await prisma.industry.findMany({
      select: { id: true, name: true }
    });

    console.log(`🏭 Found ${industries.length} industries`);

    // Industry names from industries.json: electrician, plumber, carpenter, mechanic, welder
    // We'll also create "general" quizzes with industryId = null

    const industriesToSeed = [
      { id: null, name: 'general' }, // General quizzes
      ...industries
    ];

    let totalCreated = 0;

    for (const template of templates) {
      for (const industry of industriesToSeed) {
        const templateId = industry.id === null
          ? `${template.id}-general`
          : `${template.id}-industry-${industry.id}`;

        const quizData = {
          templateId,
          levelId: template.levelId,
          industryId: industry.id,
          quizNumber: template.quizNumber,

          name: template.name,
          description: template.description || '',

          quizType: template.quizType,
          questionsPerQuiz: template.questionsPerQuiz,
          allowAIHelp: template.allowAIHelp,
          allowTranslation: template.allowTranslation,
          allowBackNavigation: template.allowBackNavigation,
          pointsPerQuestion: template.pointsPerQuestion,
          requiredToUnlock: template.requiredToUnlock,
          passingScore: template.passingScore || null,
        };

        try {
          await prisma.prebuiltQuiz.upsert({
            where: { templateId },
            update: quizData,
            create: quizData,
          });

          totalCreated++;

          const industryName = industry.name || 'general';
          console.log(
            `  ✅ Created/Updated: Level ${template.levelId}, Quiz ${template.quizNumber}, ${industryName}`
          );
        } catch (error) {
          console.error(
            `  ❌ Error creating quiz ${templateId}:`,
            error
          );
        }
      }
    }

    console.log(`\n✨ Successfully seeded ${totalCreated} prebuilt quizzes!`);
    console.log(`   ${templates.length} templates × ${industriesToSeed.length} industries`);

  } catch (error) {
    console.error('❌ Error seeding prebuilt quizzes:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPrebuiltQuizzes()
    .then(() => {
      console.log('✅ Prebuilt quiz seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Prebuilt quiz seeding failed:', error);
      process.exit(1);
    });
}
