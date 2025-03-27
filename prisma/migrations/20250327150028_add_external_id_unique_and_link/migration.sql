/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `chats` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "link" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chats_externalId_key" ON "chats"("externalId");
