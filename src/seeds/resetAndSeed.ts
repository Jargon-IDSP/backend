import { execSync } from 'child_process';
import path from 'path';

async function resetAndSeed() {
  console.log('🔥 Starting database reset and seed process...\n');

  try {
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

    console.log('🎉 Database reset and seed completed successfully!');

  } catch (error) {
    console.error('\n❌ Reset and seed failed:', error);
    process.exit(1);
  }
}

resetAndSeed();
