-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NULL,
    `userId` VARCHAR(191) NOT NULL,
    `quizId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `documents_userId_idx`(`userId`),
    INDEX `documents_quizId_idx`(`quizId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_flashcards` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
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

    INDEX `custom_flashcards_documentId_idx`(`documentId`),
    INDEX `custom_flashcards_userId_idx`(`userId`),
    INDEX `custom_flashcards_termEnglish_idx`(`termEnglish`(255)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_questions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `quizId` VARCHAR(191) NULL,
    `correctTermId` VARCHAR(191) NOT NULL,
    `promptEnglish` TEXT NOT NULL,
    `promptFrench` TEXT NOT NULL,
    `promptChinese` TEXT NOT NULL,
    `promptSpanish` TEXT NOT NULL,
    `promptTagalog` TEXT NOT NULL,
    `promptPunjabi` TEXT NOT NULL,
    `promptKorean` TEXT NOT NULL,
    `tags` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `custom_questions_userId_idx`(`userId`),
    INDEX `custom_questions_quizId_idx`(`quizId`),
    INDEX `custom_questions_correctTermId_idx`(`correctTermId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `custom_flashcards` ADD CONSTRAINT `custom_flashcards_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_questions` ADD CONSTRAINT `custom_questions_correctTermId_fkey` FOREIGN KEY (`correctTermId`) REFERENCES `custom_flashcards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
