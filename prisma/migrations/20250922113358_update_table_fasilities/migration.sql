-- CreateEnum
CREATE TYPE "public"."FacilityCategory" AS ENUM ('OUTDOOR', 'INDOOR', 'WATER', 'SPORT', 'EVENT', 'OTHER');

-- AlterTable
ALTER TABLE "public"."Facility" ADD COLUMN     "capacityLabel" TEXT,
ADD COLUMN     "category" "public"."FacilityCategory",
ADD COLUMN     "durationLabel" TEXT,
ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "heroImage" TEXT,
ADD COLUMN     "iconKey" TEXT,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rating" DECIMAL(3,2),
ADD COLUMN     "ratingCount" INTEGER;
