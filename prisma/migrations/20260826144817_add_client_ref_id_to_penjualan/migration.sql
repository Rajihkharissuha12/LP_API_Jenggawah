/*
  Warnings:

  - A unique constraint covering the columns `[clientRefId]` on the table `Penjualan` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Penjualan" ADD COLUMN     "clientRefId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Penjualan_clientRefId_key" ON "Penjualan"("clientRefId");
