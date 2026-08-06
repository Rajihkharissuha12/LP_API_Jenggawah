/*
  Warnings:

  - You are about to alter the column `hargaJual` on the `Menu` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,2)` to `Integer`.
  - You are about to alter the column `hpp` on the `Menu` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,2)` to `Integer`.
  - You are about to alter the column `marginNominal` on the `Menu` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,2)` to `Integer`.
  - You are about to alter the column `marginPersen` on the `Menu` table. The data in that column could be lost. The data in that column will be cast from `Decimal(5,2)` to `Integer`.

*/
-- AlterTable
ALTER TABLE "Menu" ALTER COLUMN "hargaJual" SET DATA TYPE INTEGER,
ALTER COLUMN "hpp" SET DEFAULT 0,
ALTER COLUMN "hpp" SET DATA TYPE INTEGER,
ALTER COLUMN "marginNominal" SET DEFAULT 0,
ALTER COLUMN "marginNominal" SET DATA TYPE INTEGER,
ALTER COLUMN "marginPersen" SET DEFAULT 0,
ALTER COLUMN "marginPersen" SET DATA TYPE INTEGER;
