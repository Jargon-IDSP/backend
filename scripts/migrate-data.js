import { PrismaClient } from '@prisma/client';

const oldDb = new PrismaClient({
  datasources: { db: { url: process.env.OLD_DATABASE_URL } }
});

const newDb = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function migrate() {
  console.log('Starting migration...');

  // Disable foreign key checks temporarily
  await newDb.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0;');

  try {
    // Migrate ALL tables without worrying about order
    console.log('Migrating Industry...');
    const industries = await oldDb.industry.findMany();
    for (const industry of industries) {
      await newDb.industry.create({ data: industry });
    }

    console.log('Migrating Category...');
    const categories = await oldDb.category.findMany();
    for (const category of categories) {
      await newDb.category.create({ data: category });
    }

    console.log('Migrating Level...');
    const levels = await oldDb.level.findMany();
    for (const level of levels) {
      await newDb.level.create({ data: level });
    }

    console.log('Migrating Badge...');
    const badges = await oldDb.badge.findMany();
    for (const badge of badges) {
      await newDb.badge.create({ data: badge });
    }

    console.log('Migrating User...');
    const users = await oldDb.user.findMany();
    for (const user of users) {
      await newDb.user.create({ data: user });
    }

    console.log('Migrating UserAvatar...');
    const avatars = await oldDb.userAvatar.findMany();
    for (const avatar of avatars) {
      await newDb.userAvatar.create({ data: avatar });
    }

    console.log('Migrating UserApprenticeshipProgress...');
    const progress = await oldDb.userApprenticeshipProgress.findMany();
    for (const p of progress) {
      await newDb.userApprenticeshipProgress.create({ data: p });
    }

    console.log('Migrating Follow...');
    const follows = await oldDb.follow.findMany();
    for (const follow of follows) {
      await newDb.follow.create({ data: follow });
    }

    console.log('Migrating Document...');
    const documents = await oldDb.document.findMany();
    for (const doc of documents) {
      await newDb.document.create({ data: doc });
    }

    console.log('Migrating DocumentTranslation...');
    const translations = await oldDb.documentTranslation.findMany();
    for (const trans of translations) {
      await newDb.documentTranslation.create({ data: trans });
    }

    console.log('Migrating Flashcard...');
    const flashcards = await oldDb.flashcard.findMany();
    for (const flashcard of flashcards) {
      await newDb.flashcard.create({ data: flashcard });
    }

    console.log('Migrating Question...');
    const questions = await oldDb.question.findMany();
    for (const question of questions) {
      await newDb.question.create({ data: question });
    }

    console.log('Migrating CustomFlashcard...');
    const customFlashcards = await oldDb.customFlashcard.findMany();
    for (const cf of customFlashcards) {
      await newDb.customFlashcard.create({ data: cf });
    }

    console.log('Migrating CustomQuestion...');
    const customQuestions = await oldDb.customQuestion.findMany();
    for (const cq of customQuestions) {
      await newDb.customQuestion.create({ data: cq });
    }

    console.log('Migrating CustomQuiz...');
    const customQuizzes = await oldDb.customQuiz.findMany();
    for (const quiz of customQuizzes) {
      await newDb.customQuiz.create({ data: quiz });
    }

  } finally {
    // Re-enable foreign key checks
    await newDb.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1;');
  }

  console.log('Migration complete! ✅');
  
  await oldDb.$disconnect();
  await newDb.$disconnect();
}

migrate().catch(console.error);