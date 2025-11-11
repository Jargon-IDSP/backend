import { prisma } from '../lib/prisma';
import type { BadgeData } from '../interfaces/badgeData';

const badges: BadgeData[] = [
  // Level Completion Badges (18 total: 3 levels × 6 industries)
  // Foundation Level Badges
  {
    code: 'foundation-general',
    name: 'Foundation Master - General',
    description: 'Complete all quizzes in Foundation level for General jargon',
    iconUrl: 'general/G1.svg',
    levelId: 1,
    industryId: 6,
  },
  {
    code: 'foundation-electrician',
    name: 'Foundation Master - Electrician',
    description: 'Complete all quizzes in Foundation level for Electrician',
    iconUrl: 'electrician/E1.svg',
    levelId: 1,
    industryId: 1,
  },
  {
    code: 'foundation-plumber',
    name: 'Foundation Master - Plumber',
    description: 'Complete all quizzes in Foundation level for Plumber',
    iconUrl: 'plumber/P1.svg',
    levelId: 1,
    industryId: 2,
  },
  {
    code: 'foundation-carpenter',
    name: 'Foundation Master - Carpenter',
    description: 'Complete all quizzes in Foundation level for Carpenter',
    iconUrl: 'carpenter/C1.svg',
    levelId: 1,
    industryId: 3,
  },
  {
    code: 'foundation-mechanic',
    name: 'Foundation Master - Mechanic',
    description: 'Complete all quizzes in Foundation level for Mechanic',
    iconUrl: 'mechanic/E1.svg',
    levelId: 1,
    industryId: 4,
  },
  {
    code: 'foundation-welder',
    name: 'Foundation Master - Welder',
    description: 'Complete all quizzes in Foundation level for Welder',
    iconUrl: 'welder/W1.svg',
    levelId: 1,
    industryId: 5,
  },

  // Intermediate Level Badges
  {
    code: 'intermediate-general',
    name: 'Intermediate Master - General',
    description: 'Complete all quizzes in Intermediate level for General jargon',
    iconUrl: 'general/G2.svg',
    levelId: 2,
    industryId: 6,
  },
  {
    code: 'intermediate-electrician',
    name: 'Intermediate Master - Electrician',
    description: 'Complete all quizzes in Intermediate level for Electrician',
    iconUrl: 'electrician/E2.svg',
    levelId: 2,
    industryId: 1,
  },
  {
    code: 'intermediate-plumber',
    name: 'Intermediate Master - Plumber',
    description: 'Complete all quizzes in Intermediate level for Plumber',
    iconUrl: 'plumber/P2.svg',
    levelId: 2,
    industryId: 2,
  },
  {
    code: 'intermediate-carpenter',
    name: 'Intermediate Master - Carpenter',
    description: 'Complete all quizzes in Intermediate level for Carpenter',
    iconUrl: 'carpenter/C2.svg',
    levelId: 2,
    industryId: 3,
  },
  {
    code: 'intermediate-mechanic',
    name: 'Intermediate Master - Mechanic',
    description: 'Complete all quizzes in Intermediate level for Mechanic',
    iconUrl: 'mechanic/E2.svg',
    levelId: 2,
    industryId: 4,
  },
  {
    code: 'intermediate-welder',
    name: 'Intermediate Master - Welder',
    description: 'Complete all quizzes in Intermediate level for Welder',
    iconUrl: 'welder/W2.svg',
    levelId: 2,
    industryId: 5,
  },

  // Advanced Level Badges
  {
    code: 'advanced-general',
    name: 'Advanced Master - General',
    description: 'Complete all quizzes in Advanced level for General jargon',
    iconUrl: 'general/G3.svg',
    levelId: 3,
    industryId: 6,
  },
  {
    code: 'advanced-electrician',
    name: 'Advanced Master - Electrician',
    description: 'Complete all quizzes in Advanced level for Electrician',
    iconUrl: 'electrician/E3.svg',
    levelId: 3,
    industryId: 1,
  },
  {
    code: 'advanced-plumber',
    name: 'Advanced Master - Plumber',
    description: 'Complete all quizzes in Advanced level for Plumber',
    iconUrl: 'plumber/P3.svg',
    levelId: 3,
    industryId: 2,
  },
  {
    code: 'advanced-carpenter',
    name: 'Advanced Master - Carpenter',
    description: 'Complete all quizzes in Advanced level for Carpenter',
    iconUrl: 'carpenter/C3.svg',
    levelId: 3,
    industryId: 3,
  },
  {
    code: 'advanced-mechanic',
    name: 'Advanced Master - Mechanic',
    description: 'Complete all quizzes in Advanced level for Mechanic',
    iconUrl: 'mechanic/E3.svg',
    levelId: 3,
    industryId: 4,
  },
  {
    code: 'advanced-welder',
    name: 'Advanced Master - Welder',
    description: 'Complete all quizzes in Advanced level for Welder',
    iconUrl: 'welder/W3.svg',
    levelId: 3,
    industryId: 5,
  },
];

export async function seedBadges() {
  console.log('🏅 Starting badge seeding...');

  try {
    // Get all industries to map industryId
    const industries = await prisma.industry.findMany({
      select: { id: true, name: true }
    });

    const industryMap = new Map<string, number>();
    industries.forEach(ind => {
      industryMap.set(ind.name.toLowerCase(), ind.id);
    });

    console.log(`🏭 Found ${industries.length} industries`);

    let totalCreated = 0;

    for (const badgeData of badges) {
      // Map industry names to IDs for level completion badges
      let industryId = badgeData.industryId;

      if (badgeData.code.includes('-')) {
        const industryName = badgeData.code.split('-')[1]; // e.g., 'electrician' from 'foundation-electrician'

        if (industryName !== 'general') {
          industryId = industryMap.get(industryName) || null;
        }
      }

      try {
        await prisma.badge.upsert({
          where: { code: badgeData.code },
          update: {
            name: badgeData.name,
            description: badgeData.description,
            iconUrl: badgeData.iconUrl,
            levelId: badgeData.levelId || null,
            industryId: industryId || null,
          },
          create: {
            code: badgeData.code,
            name: badgeData.name,
            description: badgeData.description,
            iconUrl: badgeData.iconUrl,
            levelId: badgeData.levelId || null,
            industryId: industryId || null,
          },
        });

        totalCreated++;
        console.log(`  ✅ Created/Updated: ${badgeData.name}`);
      } catch (error) {
        console.error(`  ❌ Error creating badge ${badgeData.code}:`, error);
      }
    }

    console.log(`\n✨ Successfully seeded ${totalCreated} badges!`);
    console.log(`   Level Completion: 18 badges`);

  } catch (error) {
    console.error('❌ Error seeding badges:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedBadges()
    .then(() => {
      console.log('✅ Badge seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Badge seeding failed:', error);
      process.exit(1);
    });
}
