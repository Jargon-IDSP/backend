import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { prisma } from '../lib/prisma';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface UserDataBackup {
  users: any[];
  documents: any[];
  documentTranslations: any[];
  customFlashcards: any[];
  customQuizzes: any[];
  customQuestions: any[];
  customQuizShares: any[];
  userQuizAttempts: any[];
  userBadges: any[];
  userWeeklyStats: any[];
  userAvatars: any[];
  follows: any[];
  lessonRequests: any[];
  notifications: any[];
  userApprenticeshipProgress: any[];
}

async function backupUserData(): Promise<UserDataBackup> {
  console.log('💾 Backing up user data...');

  const backup: UserDataBackup = {
    users: await prisma.user.findMany(),
    documents: await prisma.document.findMany(),
    documentTranslations: await prisma.documentTranslation.findMany(),
    customFlashcards: await prisma.customFlashcard.findMany(),
    customQuizzes: await prisma.customQuiz.findMany(),
    customQuestions: await prisma.customQuestion.findMany(),
    customQuizShares: await prisma.customQuizShare.findMany(),
    userQuizAttempts: await prisma.userQuizAttempt.findMany(),
    userBadges: await prisma.userBadge.findMany(),
    userWeeklyStats: await prisma.userWeeklyStats.findMany(),
    userAvatars: await prisma.userAvatar.findMany(),
    follows: await prisma.follow.findMany(),
    lessonRequests: await prisma.lessonRequest.findMany(),
    notifications: await prisma.notification.findMany(),
    userApprenticeshipProgress: await prisma.userApprenticeshipProgress.findMany(),
  };

  console.log('✅ Backed up:');
  console.log(`   ${backup.users.length} users`);
  console.log(`   ${backup.documents.length} documents`);
  console.log(`   ${backup.customQuizzes.length} custom quizzes`);
  console.log(`   ${backup.userQuizAttempts.length} quiz attempts`);
  console.log(`   ${backup.userBadges.length} user badges`);
  console.log(`   ${backup.userApprenticeshipProgress.length} apprenticeship progress records\n`);

  return backup;
}

async function restoreUserData(backup: UserDataBackup) {
  console.log('📥 Restoring user data...');

  try {
    // Restore in order of dependencies

    // 1. Users (no dependencies)
    if (backup.users.length > 0) {
      await prisma.user.createMany({ data: backup.users, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.users.length} users`);
    }

    // 2. User avatars (depends on users)
    if (backup.userAvatars.length > 0) {
      await prisma.userAvatar.createMany({ data: backup.userAvatars, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.userAvatars.length} user avatars`);
    }

    // 3. Documents (depends on users)
    if (backup.documents.length > 0) {
      await prisma.document.createMany({ data: backup.documents, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.documents.length} documents`);
    }

    // 4. Document translations (depends on documents)
    if (backup.documentTranslations.length > 0) {
      await prisma.documentTranslation.createMany({ data: backup.documentTranslations, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.documentTranslations.length} document translations`);
    }

    // 5. Custom flashcards (depends on documents)
    if (backup.customFlashcards.length > 0) {
      await prisma.customFlashcard.createMany({ data: backup.customFlashcards, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.customFlashcards.length} custom flashcards`);
    }

    // 6. Custom quizzes (depends on documents)
    if (backup.customQuizzes.length > 0) {
      await prisma.customQuiz.createMany({ data: backup.customQuizzes, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.customQuizzes.length} custom quizzes`);
    }

    // 7. Custom questions (depends on custom quizzes and flashcards)
    if (backup.customQuestions.length > 0) {
      await prisma.customQuestion.createMany({ data: backup.customQuestions, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.customQuestions.length} custom questions`);
    }

    // 8. Custom quiz shares (depends on custom quizzes)
    if (backup.customQuizShares.length > 0) {
      await prisma.customQuizShare.createMany({ data: backup.customQuizShares, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.customQuizShares.length} custom quiz shares`);
    }

    // 9. User quiz attempts (depends on quizzes)
    if (backup.userQuizAttempts.length > 0) {
      await prisma.userQuizAttempt.createMany({ data: backup.userQuizAttempts, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.userQuizAttempts.length} quiz attempts`);
    }

    // 10. User badges (depends on users and badges)
    if (backup.userBadges.length > 0) {
      await prisma.userBadge.createMany({ data: backup.userBadges, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.userBadges.length} user badges`);
    }

    // 11. User weekly stats
    if (backup.userWeeklyStats.length > 0) {
      await prisma.userWeeklyStats.createMany({ data: backup.userWeeklyStats, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.userWeeklyStats.length} weekly stats`);
    }

    // 12. Follows
    if (backup.follows.length > 0) {
      await prisma.follow.createMany({ data: backup.follows, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.follows.length} follows`);
    }

    // 13. Lesson requests
    if (backup.lessonRequests.length > 0) {
      await prisma.lessonRequest.createMany({ data: backup.lessonRequests, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.lessonRequests.length} lesson requests`);
    }

    // 14. Notifications
    if (backup.notifications.length > 0) {
      await prisma.notification.createMany({ data: backup.notifications, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.notifications.length} notifications`);
    }

    // 15. User apprenticeship progress
    if (backup.userApprenticeshipProgress.length > 0) {
      await prisma.userApprenticeshipProgress.createMany({ data: backup.userApprenticeshipProgress, skipDuplicates: true });
      console.log(`   ✅ Restored ${backup.userApprenticeshipProgress.length} apprenticeship progress records`);
    }

    console.log('✅ User data restoration complete!\n');
  } catch (error) {
    console.error('❌ Error restoring user data:', error);
    throw error;
  }
}

async function resetAndSeed() {
  console.log('🔥 Starting database reset and seed process...\n');

  let backup: UserDataBackup | null = null;

  try {
    // 0. Backup user data before reset
    backup = await backupUserData();

    // 1. Push schema to database (drops and recreates)
    console.log('📦 Pushing Prisma schema to database...');
    execSync('npx prisma db push --force-reset --accept-data-loss', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('✅ Schema pushed successfully\n');

    // 2. Seed categories
    console.log('📁 Seeding categories...');
    const { default: categorySeeder } = await import('./categorySeeder');
    console.log('✅ Categories seeded\n');

    // 3. Seed flashcards
    console.log('🎴 Seeding flashcards...');
    execSync('npx tsx src/seeds/flashcardSeeder.ts', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('✅ Flashcards seeded\n');

    // 4. Seed questions
    console.log('❓ Seeding questions...');
    execSync('npx tsx src/seeds/questionSeeder.ts', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('✅ Questions seeded\n');

    // 4.5 Seed prebuilt quizzes
    console.log('🎯 Seeding prebuilt quizzes...');
    execSync('npx tsx src/seeds/runPrebuiltSeeder.ts', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('✅ Prebuilt quizzes seeded\n');

    // 4.6 Seed badges
    console.log('🏅 Seeding badges...');
    execSync('npx tsx src/seeds/runBadgeSeeder.ts', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('✅ Badges seeded\n');

    // 5. Migrate users from Clerk
    console.log('👥 Migrating users from Clerk...');
    execSync('npx tsx src/seeds/migrateUsers.ts', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('✅ Users migrated\n');

    // 6. Categorize existing documents/flashcards/quizzes
    console.log('🏷️  Categorizing existing data...');
    execSync('npx tsx src/seeds/migrateCategoriestoExisting.ts', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('✅ Existing data categorized\n');

    // 7. Restore user data from backup
    if (backup) {
      await restoreUserData(backup);
    }

    console.log('🎉 Database reset and seed completed successfully!');
    console.log('✨ All user data has been preserved!\n');

  } catch (error) {
    console.error('\n❌ Reset and seed failed:', error);
    process.exit(1);
  }
}

resetAndSeed();
