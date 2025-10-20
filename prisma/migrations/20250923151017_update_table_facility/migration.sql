/*
  Warnings:

  - The `images` column on the `Facility` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Facility" DROP COLUMN "images",
ADD COLUMN     "images" JSONB;
