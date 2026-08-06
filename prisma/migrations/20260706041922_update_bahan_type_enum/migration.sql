-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BahanType" ADD VALUE 'KG';
ALTER TYPE "BahanType" ADD VALUE 'LITER';
ALTER TYPE "BahanType" ADD VALUE 'PACK';
ALTER TYPE "BahanType" ADD VALUE 'BOTOL';
