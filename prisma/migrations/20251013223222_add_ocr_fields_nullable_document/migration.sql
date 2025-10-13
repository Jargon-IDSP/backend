/*
  Warnings:

  - You are about to drop the column `quizId` on the `documents` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `custom_flashcards` DROP FOREIGN KEY `custom_flashcards_documentId_fkey`;

-- DropIndex
DROP INDEX `documents_quizId_idx` ON `documents`;

-- AlterTable
ALTER TABLE `custom_flashcards` MODIFY `documentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `documents` DROP COLUMN `quizId`,
    ADD COLUMN `extractedText` TEXT NULL,
    ADD COLUMN `ocrProcessed` BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE `custom_flashcards` ADD CONSTRAINT `custom_flashcards_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
