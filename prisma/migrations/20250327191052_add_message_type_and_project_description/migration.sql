/*
  Warnings:

  - Made the column `externalId` on table `chats` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('CUSTOMER', 'PRO', 'SOOMGO');

-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "projectDescription" TEXT,
ALTER COLUMN "externalId" SET NOT NULL,
ALTER COLUMN "unreadCount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "messageType" "MessageType" NOT NULL DEFAULT 'CUSTOMER';
