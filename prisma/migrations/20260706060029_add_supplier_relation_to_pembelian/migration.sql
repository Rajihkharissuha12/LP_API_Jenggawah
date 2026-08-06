/*
  Warnings:

  - You are about to drop the column `supplier` on the `PembelianBahan` table. All the data in the column will be lost.
  - Added the required column `supplierId` to the `PembelianBahan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PembelianBahan" DROP COLUMN "supplier",
ADD COLUMN     "supplierId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "pic" TEXT,
    "no_hp" TEXT,
    "email" TEXT,
    "alamat" TEXT,
    "keterangan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PembelianBahan" ADD CONSTRAINT "PembelianBahan_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
