import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupData() {
  console.log('🧹 Starting data cleanup...');

  try {
    // Delete in order to respect foreign key constraints
    console.log('Deleting UserQuizAnswer...');
    const deletedAnswers = await prisma.userQuizAnswer.deleteMany({});
    console.log(`✓ Deleted ${deletedAnswers.count} quiz answers`);

    console.log('Deleting UserQuizAttempt...');
    const deletedAttempts = await prisma.userQuizAttempt.deleteMany({});
    console.log(`✓ Deleted ${deletedAttempts.count} quiz attempts`);

    console.log('Deleting CustomQuestion...');
    const deletedQuestions = await prisma.customQuestion.deleteMany({});
    console.log(`✓ Deleted ${deletedQuestions.count} custom questions`);

    console.log('Deleting CustomQuiz...');
    const deletedQuizzes = await prisma.customQuiz.deleteMany({});
    console.log(`✓ Deleted ${deletedQuizzes.count} custom quizzes`);

    console.log('Deleting CustomFlashcard...');
    const deletedFlashcards = await prisma.customFlashcard.deleteMany({});
    console.log(`✓ Deleted ${deletedFlashcards.count} custom flashcards`);

    console.log('Deleting DocumentTranslation...');
    const deletedTranslations = await prisma.documentTranslation.deleteMany({});
    console.log(`✓ Deleted ${deletedTranslations.count} document translations`);

    console.log('Deleting Document...');
    const deletedDocuments = await prisma.document.deleteMany({});
    console.log(`✓ Deleted ${deletedDocuments.count} documents`);

    console.log('Deleting Notification...');
    const deletedNotifications = await prisma.notification.deleteMany({});
    console.log(`✓ Deleted ${deletedNotifications.count} notifications`);

    console.log('Deleting LessonRequest...');
    const deletedLessonRequests = await prisma.lessonRequest.deleteMany({});
    console.log(`✓ Deleted ${deletedLessonRequests.count} lesson requests`);

    console.log('Deleting Follow...');
    const deletedFollows = await prisma.follow.deleteMany({});
    console.log(`✓ Deleted ${deletedFollows.count} follows`);

    console.log('✅ Data cleanup completed successfully!');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupData()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
