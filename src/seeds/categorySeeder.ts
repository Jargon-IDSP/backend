import { prisma } from '../lib/prisma';

async function seedCategories() {
  console.log('🌱 Starting category seed...');

  // Seed categories in specific order so General is ID 6
  const categories = [
    { id: 1, name: 'Safety' },
    { id: 2, name: 'Technical' },
    { id: 3, name: 'Training' },
    { id: 4, name: 'Workplace' },
    { id: 5, name: 'Professional' },
    { id: 6, name: 'General' },
  ];

  console.log('📁 Creating categories...');
  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, isDefault: true },
      create: { id: category.id, name: category.name, isDefault: true },
    });
    console.log(`  ✅ ${category.name} (ID: ${category.id})`);
  }

  console.log('✨ Category seed completed successfully!');
}

seedCategories()
  .catch((e) => {
    console.error('❌ Category seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
