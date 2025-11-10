import { seedPrebuiltQuizzes } from './prebuiltQuizSeeder';

async function run() {
  try {
    console.log('Starting seeder...');
    await seedPrebuiltQuizzes();
    console.log('Seeder completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeder failed:', error);
    process.exit(1);
  }
}

run();
