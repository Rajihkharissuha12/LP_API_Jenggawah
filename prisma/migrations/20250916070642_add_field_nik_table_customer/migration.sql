/*
  Warnings:

  - A unique constraint covering the columns `[nik]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nik` to the `Customer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Customer" ADD COLUMN     "nik" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nik_key" ON "public"."Customer"("nik");
