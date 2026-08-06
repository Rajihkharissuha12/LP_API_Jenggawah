/*
  Warnings:

  - You are about to drop the column `imgBarang` on the `PembelianBahan` table. All the data in the column will be lost.
  - You are about to drop the column `imgStruk` on the `PembelianBahan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PembelianBahan" DROP COLUMN "imgBarang",
DROP COLUMN "imgStruk",
ADD COLUMN     "imgBarangPath" TEXT,
ADD COLUMN     "imgBarangUrl" TEXT,
ADD COLUMN     "imgStrukPath" TEXT,
ADD COLUMN     "imgStrukUrl" TEXT;
