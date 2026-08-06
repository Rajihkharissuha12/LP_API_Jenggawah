-- CreateEnum
CREATE TYPE "StockOpnameStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StockOpname" (
    "id" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "status" "StockOpnameStatus" NOT NULL DEFAULT 'DRAFT',
    "totalBarang" INTEGER NOT NULL DEFAULT 0,
    "totalSelisih" INTEGER NOT NULL DEFAULT 0,
    "keterangan" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StockOpname_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOpnameDetail" (
    "id" TEXT NOT NULL,
    "stockOpnameId" TEXT NOT NULL,
    "bahanId" TEXT NOT NULL,
    "stokSistem" INTEGER NOT NULL,
    "stokFisik" INTEGER NOT NULL,
    "selisih" INTEGER NOT NULL,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockOpnameDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockOpname_nomor_key" ON "StockOpname"("nomor");

-- CreateIndex
CREATE INDEX "StockOpname_tanggal_idx" ON "StockOpname"("tanggal");

-- CreateIndex
CREATE INDEX "StockOpname_status_idx" ON "StockOpname"("status");

-- CreateIndex
CREATE INDEX "StockOpnameDetail_stockOpnameId_idx" ON "StockOpnameDetail"("stockOpnameId");

-- CreateIndex
CREATE INDEX "StockOpnameDetail_bahanId_idx" ON "StockOpnameDetail"("bahanId");

-- AddForeignKey
ALTER TABLE "StockOpname" ADD CONSTRAINT "StockOpname_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOpnameDetail" ADD CONSTRAINT "StockOpnameDetail_stockOpnameId_fkey" FOREIGN KEY ("stockOpnameId") REFERENCES "StockOpname"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOpnameDetail" ADD CONSTRAINT "StockOpnameDetail_bahanId_fkey" FOREIGN KEY ("bahanId") REFERENCES "Bahan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
