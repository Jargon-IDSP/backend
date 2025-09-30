-- DropForeignKey
ALTER TABLE `flashcards` DROP FOREIGN KEY `flashcards_industryId_fkey`;

-- DropIndex
DROP INDEX `flashcards_industryId_fkey` ON `flashcards`;

-- AlterTable
ALTER TABLE `flashcards` MODIFY `industryId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_industryId_fkey` FOREIGN KEY (`industryId`) REFERENCES `industries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
