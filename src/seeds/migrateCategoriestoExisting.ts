import { prisma } from "../lib/prisma";
import { categorizeDocument } from "../controllers/helperFunctions/documentHelper";
import redisClient, { connectRedis } from "../lib/redis";

async function migrateCategoriestoExisting() {
  console.log("🔄 Starting category migration for existing data...\n");

  try {
    // Connect to Redis
    console.log("🔌 Connecting to Redis...");
    await connectRedis();
    console.log("✅ Redis connected\n");

    // 1. Get all documents
    console.log("📄 Fetching documents...");
    const documents = await prisma.document.findMany({
      select: {
        id: true,
        filename: true,
        extractedText: true,
      },
    });
    console.log(`Found ${documents.length} documents\n`);

    // 2. Categorize and update documents
    console.log("🏷️  Categorizing documents...");
    const categoryNameToId: Record<string, number> = {
      Safety: 1,
      Technical: 2,
      Training: 3,
      Workplace: 4,
      Professional: 5,
      General: 6,
    };

    let cacheHits = 0;
    let cacheMisses = 0;

    for (const doc of documents) {
      try {
        let categoryId = 6; // Default to General

        // Only categorize if we have extracted text
        if (doc.extractedText) {
          // Check Redis cache first
          const cacheKey = `category:doc:${doc.id}`;
          const cachedCategory = await redisClient.get(cacheKey);

          let categoryName: string;

          if (cachedCategory) {
            // Use cached category
            categoryName = String(cachedCategory);
            categoryId = categoryNameToId[categoryName] || 6;
            cacheHits++;
            console.log(
              `  💾 ${doc.filename} -> ${categoryName} (ID: ${categoryId}) (cached)`
            );
          } else {
            // Categorize and cache the result
            const result = await categorizeDocument(doc.extractedText);
            categoryName = String(result);

            // Store in Redis with 30-day expiry
            await redisClient.setEx(cacheKey, 2592000, categoryName);

            categoryId = categoryNameToId[categoryName] || 6;
            cacheMisses++;
            console.log(
              `  📄 ${doc.filename} -> ${categoryName} (ID: ${categoryId})`
            );
          }
        } else {
          console.log(`  📄 ${doc.filename} -> General (no extracted text)`);
        }

        // Update document
        await prisma.document.update({
          where: { id: doc.id },
          data: { categoryId },
        });

        // Update all flashcards associated with this document
        await prisma.customFlashcard.updateMany({
          where: { documentId: doc.id },
          data: { categoryId },
        });

        // Update all quizzes associated with this document
        await prisma.customQuiz.updateMany({
          where: { documentId: doc.id },
          data: { categoryId },
        });

        // Update all questions associated with quizzes for this document
        const quizzes = await prisma.customQuiz.findMany({
          where: { documentId: doc.id },
          select: { id: true },
        });

        for (const quiz of quizzes) {
          await prisma.customQuestion.updateMany({
            where: { customQuizId: quiz.id },
            data: { categoryId },
          });
        }
      } catch (error) {
        console.error(
          `  ❌ Error categorizing document ${doc.filename}:`,
          error
        );
        // Continue with next document
      }
    }

    console.log("\n✅ Document categorization complete!");
    console.log(
      `📊 Cache Statistics: ${cacheHits} hits, ${cacheMisses} misses (${
        Math.round((cacheHits / (cacheHits + cacheMisses)) * 100) || 0
      }% hit rate)`
    );

    // 3. Handle orphaned flashcards/questions/quizzes (not associated with any document)
    console.log(
      "\n🔍 Handling orphaned data (not associated with documents)..."
    );

    // Update orphaned flashcards to General
    const orphanedFlashcards = await prisma.customFlashcard.updateMany({
      where: { documentId: null },
      data: { categoryId: 6 },
    });
    console.log(
      `  ✅ Updated ${orphanedFlashcards.count} orphaned flashcards to General`
    );

    // Update orphaned quizzes to General
    const orphanedQuizzes = await prisma.customQuiz.updateMany({
      where: { documentId: null },
      data: { categoryId: 6 },
    });
    console.log(
      `  ✅ Updated ${orphanedQuizzes.count} orphaned quizzes to General`
    );

    // Update orphaned questions to General
    const orphanedQuestions = await prisma.customQuestion.updateMany({
      where: {
        customQuiz: {
          documentId: null,
        },
      },
      data: { categoryId: 6 },
    });
    console.log(
      `  ✅ Updated ${orphanedQuestions.count} orphaned questions to General`
    );

    console.log("\n🎉 Category migration completed successfully!");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log("🔌 Redis disconnected");
    }
  }
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("migrateCategoriestoExisting.ts")
) {
  migrateCategoriestoExisting()
    .then(() => {
      console.log("Migration completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

export { migrateCategoriestoExisting };
