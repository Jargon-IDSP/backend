import { prisma } from '../lib/prisma';
import type { BadgeData } from '../interfaces/badgeData';

const badges: BadgeData[] = [
  // Level Completion Badges (18 total: 3 levels × 6 industries)
  // Foundation Level Badges
  {
    code: 'foundation-general',
    name: 'Foundation Master - General',
    description: 'Complete all quizzes in Foundation level for General jargon',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 1,
    industryId: null,
  },
  {
    code: 'foundation-electrician',
    name: 'Foundation Master - Electrician',
    description: 'Complete all quizzes in Foundation level for Electrician',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 1,
  },
  {
    code: 'foundation-plumber',
    name: 'Foundation Master - Plumber',
    description: 'Complete all quizzes in Foundation level for Plumber',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 1,
  },
  {
    code: 'foundation-carpenter',
    name: 'Foundation Master - Carpenter',
    description: 'Complete all quizzes in Foundation level for Carpenter',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 1,
  },
  {
    code: 'foundation-mechanic',
    name: 'Foundation Master - Mechanic',
    description: 'Complete all quizzes in Foundation level for Mechanic',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 1,
  },
  {
    code: 'foundation-welder',
    name: 'Foundation Master - Welder',
    description: 'Complete all quizzes in Foundation level for Welder',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 1,
  },

  // Intermediate Level Badges
  {
    code: 'intermediate-general',
    name: 'Intermediate Master - General',
    description: 'Complete all quizzes in Intermediate level for General jargon',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 2,
    industryId: null,
  },
  {
    code: 'intermediate-electrician',
    name: 'Intermediate Master - Electrician',
    description: 'Complete all quizzes in Intermediate level for Electrician',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 2,
  },
  {
    code: 'intermediate-plumber',
    name: 'Intermediate Master - Plumber',
    description: 'Complete all quizzes in Intermediate level for Plumber',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 2,
  },
  {
    code: 'intermediate-carpenter',
    name: 'Intermediate Master - Carpenter',
    description: 'Complete all quizzes in Intermediate level for Carpenter',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 2,
  },
  {
    code: 'intermediate-mechanic',
    name: 'Intermediate Master - Mechanic',
    description: 'Complete all quizzes in Intermediate level for Mechanic',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 2,
  },
  {
    code: 'intermediate-welder',
    name: 'Intermediate Master - Welder',
    description: 'Complete all quizzes in Intermediate level for Welder',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 2,
  },

  // Advanced Level Badges
  {
    code: 'advanced-general',
    name: 'Advanced Master - General',
    description: 'Complete all quizzes in Advanced level for General jargon',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 3,
    industryId: null,
  },
  {
    code: 'advanced-electrician',
    name: 'Advanced Master - Electrician',
    description: 'Complete all quizzes in Advanced level for Electrician',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 3,
  },
  {
    code: 'advanced-plumber',
    name: 'Advanced Master - Plumber',
    description: 'Complete all quizzes in Advanced level for Plumber',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 3,
  },
  {
    code: 'advanced-carpenter',
    name: 'Advanced Master - Carpenter',
    description: 'Complete all quizzes in Advanced level for Carpenter',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 3,
  },
  {
    code: 'advanced-mechanic',
    name: 'Advanced Master - Mechanic',
    description: 'Complete all quizzes in Advanced level for Mechanic',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 3,
  },
  {
    code: 'advanced-welder',
    name: 'Advanced Master - Welder',
    description: 'Complete all quizzes in Advanced level for Welder',
    iconUrl: null,
    category: 'LEVEL_COMPLETION',
    levelId: 3,
  },

  // Quiz Completion Badges (2)
  {
    code: 'first-quiz',
    name: 'First Steps',
    description: 'Complete your first quiz',
    iconUrl: null,
    category: 'QUIZ_COMPLETION',
    requiresQuizCount: 1,
  },
  {
    code: 'boss-slayer',
    name: 'Boss Slayer',
    description: 'Complete your first Boss Quiz',
    iconUrl: null,
    category: 'QUIZ_COMPLETION',
  },

  // Points Milestone Badges (6)
  {
    code: 'points-100',
    name: 'Getting Started',
    description: 'Earn 100 points',
    iconUrl: null,
    category: 'POINTS_MILESTONE',
    requiresPoints: 100,
  },
  {
    code: 'points-250',
    name: 'On a Roll',
    description: 'Earn 250 points',
    iconUrl: null,
    category: 'POINTS_MILESTONE',
    requiresPoints: 250,
  },
  {
    code: 'points-500',
    name: 'Point Collector',
    description: 'Earn 500 points',
    iconUrl: null,
    category: 'POINTS_MILESTONE',
    requiresPoints: 500,
  },
  {
    code: 'points-1000',
    name: 'Dedicated Learner',
    description: 'Earn 1,000 points',
    iconUrl: null,
    category: 'POINTS_MILESTONE',
    requiresPoints: 1000,
  },
  {
    code: 'points-2500',
    name: 'Knowledge Seeker',
    description: 'Earn 2,500 points',
    iconUrl: null,
    category: 'POINTS_MILESTONE',
    requiresPoints: 2500,
  },
  {
    code: 'points-5000',
    name: 'Master Scholar',
    description: 'Earn 5,000 points',
    iconUrl: null,
    category: 'POINTS_MILESTONE',
    requiresPoints: 5000,
  },

  // Streak Badges (3)
  {
    code: 'streak-3',
    name: 'Starting Streak',
    description: 'Practice for 3 days in a row',
    iconUrl: null,
    category: 'STREAK',
  },
  {
    code: 'streak-7',
    name: 'Week Warrior',
    description: 'Practice for 7 days in a row',
    iconUrl: null,
    category: 'STREAK',
  },
  {
    code: 'streak-30',
    name: 'Unstoppable',
    description: 'Practice for 30 days in a row',
    iconUrl: null,
    category: 'STREAK',
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

      if (badgeData.category === 'LEVEL_COMPLETION' && badgeData.code.includes('-')) {
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
            category: badgeData.category,
            levelId: badgeData.levelId || null,
            industryId: industryId || null,
            requiresQuizCount: badgeData.requiresQuizCount || null,
            requiresPoints: badgeData.requiresPoints || null,
          },
          create: {
            code: badgeData.code,
            name: badgeData.name,
            description: badgeData.description,
            iconUrl: badgeData.iconUrl,
            category: badgeData.category,
            levelId: badgeData.levelId || null,
            industryId: industryId || null,
            requiresQuizCount: badgeData.requiresQuizCount || null,
            requiresPoints: badgeData.requiresPoints || null,
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
    console.log(`   Quiz Completion: 2 badges`);
    console.log(`   Points Milestones: 6 badges`);
    console.log(`   Streaks: 3 badges`);

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
