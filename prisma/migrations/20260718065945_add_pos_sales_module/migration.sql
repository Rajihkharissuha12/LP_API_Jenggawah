/*
  Warnings:

  - You are about to drop the `Production` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductionDetail` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SalesPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'QRIS');

-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKE_AWAY');

-- CreateEnum
CREATE TYPE "PaymentStatuss" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- DropForeignKey
ALTER TABLE "Production" DROP CONSTRAINT "Production_adminId_fkey";

-- DropForeignKey
ALTER TABLE "Production" DROP CONSTRAINT "Production_menuId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionDetail" DROP CONSTRAINT "ProductionDetail_bahanId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionDetail" DROP CONSTRAINT "ProductionDetail_productionId_fkey";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "StokMutasi" ADD COLUMN     "penjualanId" TEXT;

-- DropTable
DROP TABLE "Production";

-- DropTable
DROP TABLE "ProductionDetail";

-- CreateTable
CREATE TABLE "Penjualan" (
    "id" TEXT NOT NULL,
    "nomorInvoice" TEXT NOT NULL,
    "queueNumber" TEXT,
    "adminId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "orderType" "OrderType" NOT NULL,
    "tableName" TEXT,
    "subtotal" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "isTaxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL,
    "status" "SalesStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "totalItem" INTEGER NOT NULL,
    "paymentStatus" "PaymentStatuss" NOT NULL DEFAULT 'UNPAID',
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Penjualan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenjualanPayment" (
    "id" TEXT NOT NULL,
    "penjualanId" TEXT NOT NULL,
    "method" "SalesPaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL,
    "changeAmount" INTEGER NOT NULL,
    "proofImagePath" TEXT,
    "proofImageUrl" TEXT,
    "referenceNo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PenjualanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenjualanDetail" (
    "id" TEXT NOT NULL,
    "penjualanId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "namaMenu" TEXT NOT NULL,
    "catatan" TEXT,
    "hargaJual" INTEGER NOT NULL,
    "hpp" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "fotoMenu" TEXT,
    "categoryName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenjualanDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenjualanDetailRecipe" (
    "id" TEXT NOT NULL,
    "penjualanDetailId" TEXT NOT NULL,
    "bahanId" TEXT NOT NULL,
    "namaBahan" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "hargaPerUnit" DECIMAL(12,2) NOT NULL,
    "totalHpp" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PenjualanDetailRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Penjualan_nomorInvoice_key" ON "Penjualan"("nomorInvoice");

-- CreateIndex
CREATE INDEX "Penjualan_createdAt_idx" ON "Penjualan"("createdAt");

-- CreateIndex
CREATE INDEX "Penjualan_status_idx" ON "Penjualan"("status");

-- CreateIndex
CREATE INDEX "Penjualan_paymentStatus_idx" ON "Penjualan"("paymentStatus");

-- CreateIndex
CREATE INDEX "Penjualan_adminId_idx" ON "Penjualan"("adminId");

-- CreateIndex
CREATE INDEX "Penjualan_cashSessionId_idx" ON "Penjualan"("cashSessionId");

-- CreateIndex
CREATE INDEX "PenjualanPayment_penjualanId_idx" ON "PenjualanPayment"("penjualanId");

-- CreateIndex
CREATE INDEX "PenjualanDetail_penjualanId_idx" ON "PenjualanDetail"("penjualanId");

-- AddForeignKey
ALTER TABLE "StokMutasi" ADD CONSTRAINT "StokMutasi_penjualanId_fkey" FOREIGN KEY ("penjualanId") REFERENCES "Penjualan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penjualan" ADD CONSTRAINT "Penjualan_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penjualan" ADD CONSTRAINT "Penjualan_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanPayment" ADD CONSTRAINT "PenjualanPayment_penjualanId_fkey" FOREIGN KEY ("penjualanId") REFERENCES "Penjualan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanDetail" ADD CONSTRAINT "PenjualanDetail_penjualanId_fkey" FOREIGN KEY ("penjualanId") REFERENCES "Penjualan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanDetail" ADD CONSTRAINT "PenjualanDetail_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanDetailRecipe" ADD CONSTRAINT "PenjualanDetailRecipe_penjualanDetailId_fkey" FOREIGN KEY ("penjualanDetailId") REFERENCES "PenjualanDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenjualanDetailRecipe" ADD CONSTRAINT "PenjualanDetailRecipe_bahanId_fkey" FOREIGN KEY ("bahanId") REFERENCES "Bahan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
