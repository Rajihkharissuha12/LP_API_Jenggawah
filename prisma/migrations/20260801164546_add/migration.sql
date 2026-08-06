-- AlterTable
ALTER TABLE "Penjualan" ADD COLUMN     "discountPercent" INTEGER DEFAULT 0,
ALTER COLUMN "discountAmount" DROP NOT NULL;
