/*
  Warnings:

  - You are about to drop the column `tableName` on the `Penjualan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Penjualan" DROP COLUMN "tableName",
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "tableNumber" TEXT,
ADD COLUMN     "taxPercent" INTEGER NOT NULL DEFAULT 0;
