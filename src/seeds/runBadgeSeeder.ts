import { seedBadges } from './badgeSeeder';

async function run() {
  try {
    console.log('Starting badge seeder...');
    await seedBadges();
    console.log('Badge seeder completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Badge seeder failed:', error);
    process.exit(1);
  }
}

run();
