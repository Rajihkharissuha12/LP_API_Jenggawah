/*
  Warnings:

  - You are about to drop the column `tax` on the `Config` table. All the data in the column will be lost.
  - Added the required column `name` to the `Config` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `Config` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Config" DROP COLUMN "tax",
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "value" BOOLEAN NOT NULL;
