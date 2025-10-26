-- CreateTable
CREATE TABLE `industries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `industries_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `levels_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flashcards` (
    `id` VARCHAR(191) NOT NULL,
    `termEnglish` TEXT NOT NULL,
    `termFrench` TEXT NOT NULL,
    `termChinese` TEXT NOT NULL,
    `termSpanish` TEXT NOT NULL,
    `termTagalog` TEXT NOT NULL,
    `termPunjabi` TEXT NOT NULL,
    `termKorean` TEXT NOT NULL,
    `definitionEnglish` TEXT NOT NULL,
    `definitionFrench` TEXT NOT NULL,
    `definitionChinese` TEXT NOT NULL,
    `definitionSpanish` TEXT NOT NULL,
    `definitionTagalog` TEXT NOT NULL,
    `definitionPunjabi` TEXT NOT NULL,
    `definitionKorean` TEXT NOT NULL,
    `industryId` INTEGER NULL,
    `levelId` INTEGER NOT NULL,

    INDEX `flashcards_levelId_industryId_idx`(`levelId`, `industryId`),
    INDEX `flashcards_industryId_levelId_idx`(`industryId`, `levelId`),
    INDEX `flashcards_termEnglish_idx`(`termEnglish`(255)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` VARCHAR(191) NOT NULL,
    `correctTermId` VARCHAR(191) NOT NULL,
    `promptEnglish` TEXT NOT NULL,
    `promptFrench` TEXT NOT NULL,
    `promptChinese` TEXT NOT NULL,
    `promptSpanish` TEXT NOT NULL,
    `promptTagalog` TEXT NOT NULL,
    `promptPunjabi` TEXT NOT NULL,
    `promptKorean` TEXT NOT NULL,
    `difficulty` INTEGER NOT NULL,
    `tags` TEXT NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 5,

    INDEX `questions_correctTermId_fkey`(`correctTermId`),
    INDEX `questions_difficulty_idx`(`difficulty`),
    INDEX `questions_points_idx`(`points`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NULL,
    `extractedText` TEXT NULL,
    `ocrProcessed` BOOLEAN NOT NULL DEFAULT false,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `documents_userId_idx`(`userId`),
    INDEX `documents_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_translations` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `textEnglish` LONGTEXT NOT NULL,
    `textFrench` LONGTEXT NOT NULL,
    `textChinese` LONGTEXT NOT NULL,
    `textSpanish` LONGTEXT NOT NULL,
    `textTagalog` LONGTEXT NOT NULL,
    `textPunjabi` LONGTEXT NOT NULL,
    `textKorean` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_translations_documentId_key`(`documentId`),
    INDEX `document_translations_documentId_idx`(`documentId`),
    INDEX `document_translations_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_flashcards` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `category` ENUM('Safety', 'Technical', 'Training', 'Workplace', 'Professional', 'General') NOT NULL DEFAULT 'General',
    `termEnglish` TEXT NOT NULL,
    `termFrench` TEXT NOT NULL,
    `termChinese` TEXT NOT NULL,
    `termSpanish` TEXT NOT NULL,
    `termTagalog` TEXT NOT NULL,
    `termPunjabi` TEXT NOT NULL,
    `termKorean` TEXT NOT NULL,
    `definitionEnglish` TEXT NOT NULL,
    `definitionFrench` TEXT NOT NULL,
    `definitionChinese` TEXT NOT NULL,
    `definitionSpanish` TEXT NOT NULL,
    `definitionTagalog` TEXT NOT NULL,
    `definitionPunjabi` TEXT NOT NULL,
    `definitionKorean` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `custom_flashcards_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `custom_flashcards_documentId_createdAt_idx`(`documentId`, `createdAt`),
    INDEX `custom_flashcards_category_idx`(`category`),
    INDEX `custom_flashcards_termEnglish_idx`(`termEnglish`(255)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_questions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `customQuizId` VARCHAR(191) NULL,
    `correctTermId` VARCHAR(191) NOT NULL,
    `category` ENUM('Safety', 'Technical', 'Training', 'Workplace', 'Professional', 'General') NOT NULL DEFAULT 'General',
    `promptEnglish` TEXT NOT NULL,
    `promptFrench` TEXT NOT NULL,
    `promptChinese` TEXT NOT NULL,
    `promptSpanish` TEXT NOT NULL,
    `promptTagalog` TEXT NOT NULL,
    `promptPunjabi` TEXT NOT NULL,
    `promptKorean` TEXT NOT NULL,
    `pointsWorth` INTEGER NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `custom_questions_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `custom_questions_customQuizId_createdAt_idx`(`customQuizId`, `createdAt`),
    INDEX `custom_questions_category_idx`(`category`),
    INDEX `custom_questions_correctTermId_idx`(`correctTermId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_quizzes` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('Safety', 'Technical', 'Training', 'Workplace', 'Professional', 'General') NULL,
    `pointsPerQuestion` INTEGER NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `custom_quizzes_userId_idx`(`userId`),
    INDEX `custom_quizzes_category_idx`(`category`),
    INDEX `custom_quizzes_documentId_idx`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_quiz_shares` (
    `id` VARCHAR(191) NOT NULL,
    `customQuizId` VARCHAR(191) NOT NULL,
    `sharedWithUserId` VARCHAR(191) NOT NULL,
    `sharedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `custom_quiz_shares_customQuizId_idx`(`customQuizId`),
    INDEX `custom_quiz_shares_sharedWithUserId_idx`(`sharedWithUserId`),
    UNIQUE INDEX `custom_quiz_shares_customQuizId_sharedWithUserId_key`(`customQuizId`, `sharedWithUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_quiz_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `customQuizId` VARCHAR(191) NULL,
    `levelId` INTEGER NULL,
    `questionsAnswered` INTEGER NOT NULL DEFAULT 0,
    `questionsCorrect` INTEGER NOT NULL DEFAULT 0,
    `totalQuestions` INTEGER NOT NULL,
    `percentComplete` INTEGER NOT NULL DEFAULT 0,
    `percentCorrect` INTEGER NOT NULL DEFAULT 0,
    `pointsEarned` INTEGER NOT NULL DEFAULT 0,
    `maxPossiblePoints` INTEGER NOT NULL,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `user_quiz_attempts_userId_idx`(`userId`),
    INDEX `user_quiz_attempts_customQuizId_idx`(`customQuizId`),
    INDEX `user_quiz_attempts_levelId_idx`(`levelId`),
    INDEX `user_quiz_attempts_completed_idx`(`completed`),
    INDEX `user_quiz_attempts_userId_completed_idx`(`userId`, `completed`),
    INDEX `user_quiz_attempts_userId_customQuizId_idx`(`userId`, `customQuizId`),
    INDEX `user_quiz_attempts_userId_levelId_idx`(`userId`, `levelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_quiz_answers` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `answerId` VARCHAR(191) NOT NULL,
    `isCorrect` BOOLEAN NOT NULL,
    `pointsEarned` INTEGER NOT NULL DEFAULT 0,
    `answeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_quiz_answers_attemptId_idx`(`attemptId`),
    INDEX `user_quiz_answers_questionId_idx`(`questionId`),
    UNIQUE INDEX `user_quiz_answers_attemptId_questionId_key`(`attemptId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_weekly_stats` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `weekStartDate` DATETIME(3) NOT NULL,
    `weeklyScore` INTEGER NOT NULL DEFAULT 0,
    `daysActive` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_weekly_stats_userId_idx`(`userId`),
    INDEX `user_weekly_stats_weekStartDate_idx`(`weekStartDate`),
    INDEX `user_weekly_stats_weeklyScore_idx`(`weeklyScore`),
    UNIQUE INDEX `user_weekly_stats_userId_weekStartDate_key`(`userId`, `weekStartDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `username` VARCHAR(191) NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'english',
    `industryId` INTEGER NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `users_email_idx`(`email`),
    INDEX `users_score_idx`(`score`),
    INDEX `users_industryId_idx`(`industryId`),
    INDEX `users_language_idx`(`language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_avatars` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `character` VARCHAR(191) NOT NULL DEFAULT 'rocky',
    `outfit` VARCHAR(191) NOT NULL DEFAULT 'default',
    `hatType` VARCHAR(191) NULL,
    `accessory1` VARCHAR(191) NULL,
    `accessory2` VARCHAR(191) NULL,
    `accessory3` VARCHAR(191) NULL,
    `primaryColor` VARCHAR(191) NOT NULL DEFAULT '#FFB6C1',
    `secondaryColor` VARCHAR(191) NOT NULL DEFAULT '#FF69B4',
    `accentColor` VARCHAR(191) NOT NULL DEFAULT '#FFC0CB',
    `unlockedItems` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_avatars_userId_key`(`userId`),
    INDEX `user_avatars_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `friendships` (
    `id` VARCHAR(191) NOT NULL,
    `requesterId` VARCHAR(191) NOT NULL,
    `addresseeId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `friendships_requesterId_idx`(`requesterId`),
    INDEX `friendships_addresseeId_idx`(`addresseeId`),
    INDEX `friendships_status_idx`(`status`),
    UNIQUE INDEX `friendships_requesterId_addresseeId_key`(`requesterId`, `addresseeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_industryId_fkey` FOREIGN KEY (`industryId`) REFERENCES `industries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_correctTermId_fkey` FOREIGN KEY (`correctTermId`) REFERENCES `flashcards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_translations` ADD CONSTRAINT `document_translations_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_translations` ADD CONSTRAINT `document_translations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_flashcards` ADD CONSTRAINT `custom_flashcards_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_flashcards` ADD CONSTRAINT `custom_flashcards_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_questions` ADD CONSTRAINT `custom_questions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_questions` ADD CONSTRAINT `custom_questions_correctTermId_fkey` FOREIGN KEY (`correctTermId`) REFERENCES `custom_flashcards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_questions` ADD CONSTRAINT `custom_questions_customQuizId_fkey` FOREIGN KEY (`customQuizId`) REFERENCES `custom_quizzes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_quizzes` ADD CONSTRAINT `custom_quizzes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_quizzes` ADD CONSTRAINT `custom_quizzes_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_quiz_shares` ADD CONSTRAINT `custom_quiz_shares_customQuizId_fkey` FOREIGN KEY (`customQuizId`) REFERENCES `custom_quizzes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_quiz_shares` ADD CONSTRAINT `custom_quiz_shares_sharedWithUserId_fkey` FOREIGN KEY (`sharedWithUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_quiz_attempts` ADD CONSTRAINT `user_quiz_attempts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_quiz_attempts` ADD CONSTRAINT `user_quiz_attempts_customQuizId_fkey` FOREIGN KEY (`customQuizId`) REFERENCES `custom_quizzes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_quiz_attempts` ADD CONSTRAINT `user_quiz_attempts_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_quiz_answers` ADD CONSTRAINT `user_quiz_answers_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `user_quiz_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_quiz_answers` ADD CONSTRAINT `user_quiz_answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `custom_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_quiz_answers` ADD CONSTRAINT `user_quiz_answers_answerId_fkey` FOREIGN KEY (`answerId`) REFERENCES `custom_flashcards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_weekly_stats` ADD CONSTRAINT `user_weekly_stats_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_industryId_fkey` FOREIGN KEY (`industryId`) REFERENCES `industries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_avatars` ADD CONSTRAINT `user_avatars_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `friendships` ADD CONSTRAINT `friendships_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `friendships` ADD CONSTRAINT `friendships_addresseeId_fkey` FOREIGN KEY (`addresseeId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
