-- CreateEnum
CREATE TYPE "BahanType" AS ENUM ('ML', 'GRAM', 'PCS');

-- CreateEnum
CREATE TYPE "BahanTypePembelian" AS ENUM ('DUS', 'PACK', 'KARUNG', 'BOTOL');

-- CreateEnum
CREATE TYPE "JenisMutasi" AS ENUM ('MASUK', 'KELUAR', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Bahan" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "satuan" "BahanType" NOT NULL,
    "minimum_stok" INTEGER NOT NULL,
    "stok" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Bahan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PembelianBahan" (
    "id" TEXT NOT NULL,
    "bahanId" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "qtyBeli" INTEGER NOT NULL,
    "satuanBeli" "BahanTypePembelian" NOT NULL,
    "isiPerSatuan" INTEGER NOT NULL,
    "hargaSatuan" DECIMAL(12,2) NOT NULL,
    "hargaTotal" DECIMAL(12,2) NOT NULL,
    "supplier" TEXT NOT NULL,
    "imgStruk" TEXT,
    "imgBarang" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PembelianBahan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StokMutasi" (
    "id" TEXT NOT NULL,
    "bahanId" TEXT NOT NULL,
    "jenis" "JenisMutasi" NOT NULL,
    "qty" INTEGER NOT NULL,
    "stokSetelah" INTEGER NOT NULL,
    "keterangan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StokMutasi_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PembelianBahan" ADD CONSTRAINT "PembelianBahan_bahanId_fkey" FOREIGN KEY ("bahanId") REFERENCES "Bahan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokMutasi" ADD CONSTRAINT "StokMutasi_bahanId_fkey" FOREIGN KEY ("bahanId") REFERENCES "Bahan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
