-- AlterTable
ALTER TABLE "PembelianBahan" ADD COLUMN     "optional" JSONB,
ADD COLUMN     "totalOptional" INTEGER DEFAULT 0;
