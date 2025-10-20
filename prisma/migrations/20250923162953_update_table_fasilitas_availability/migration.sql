/*
  Warnings:

  - You are about to drop the `FacilityAvailability` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `availability` to the `Facility` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."FacilityAvailability" DROP CONSTRAINT "FacilityAvailability_facilityId_fkey";

-- AlterTable
ALTER TABLE "public"."Facility" ADD COLUMN     "availability" "public"."AvailabilityType" NOT NULL;

-- DropTable
DROP TABLE "public"."FacilityAvailability";
