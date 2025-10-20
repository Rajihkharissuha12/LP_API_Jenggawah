/*
  Warnings:

  - The `heroImage` column on the `Facility` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Facility" DROP COLUMN "heroImage",
ADD COLUMN     "heroImage" JSONB;
