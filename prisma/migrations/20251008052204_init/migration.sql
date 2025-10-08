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

    INDEX `flashcards_industryId_idx`(`industryId`),
    INDEX `flashcards_levelId_idx`(`levelId`),
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

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_industryId_fkey` FOREIGN KEY (`industryId`) REFERENCES `industries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_correctTermId_fkey` FOREIGN KEY (`correctTermId`) REFERENCES `flashcards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
