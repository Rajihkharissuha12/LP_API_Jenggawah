/*
  Migration:
  - Convert existing timestamp columns to TIMESTAMPTZ
  - Preserve existing timestamps as UTC
  - Safely add new timestamp columns to existing tables
*/


-- =========================================================
-- Admin
-- =========================================================

ALTER TABLE "Admin"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- AdminRole
-- =========================================================

ALTER TABLE "AdminRole"
  ALTER COLUMN "assignedAt"
    TYPE TIMESTAMPTZ(3)
    USING "assignedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- AuditLog
-- =========================================================

ALTER TABLE "AuditLog"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Bahan
-- =========================================================

ALTER TABLE "Bahan"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Booking
-- =========================================================

ALTER TABLE "Booking"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- BookingItem
-- =========================================================
-- createdAt dan isDeleted juga merupakan kolom baru.
-- Karena tabel sudah berisi data, createdAt diberi
-- CURRENT_TIMESTAMP untuk data lama.
--
-- updatedAt dibuat nullable terlebih dahulu,
-- kemudian diisi dari createdAt,
-- lalu diubah menjadi NOT NULL.


ALTER TABLE "BookingItem"
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3);


UPDATE "BookingItem"
SET "updatedAt" = "createdAt";


ALTER TABLE "BookingItem"
  ALTER COLUMN "updatedAt" SET NOT NULL;


-- =========================================================
-- CashSession
-- =========================================================

ALTER TABLE "CashSession"
  ALTER COLUMN "openedAt"
    TYPE TIMESTAMPTZ(3)
    USING "openedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- ContactLog
-- =========================================================

ALTER TABLE "ContactLog"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Customer
-- =========================================================

ALTER TABLE "Customer"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Facility
-- =========================================================

ALTER TABLE "Facility"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- FacilityClosure
-- =========================================================

ALTER TABLE "FacilityClosure"
  ALTER COLUMN "startAt"
    TYPE TIMESTAMPTZ(3)
    USING "startAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endAt"
    TYPE TIMESTAMPTZ(3)
    USING "endAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Menu
-- =========================================================

ALTER TABLE "Menu"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- MenuCategory
-- =========================================================

ALTER TABLE "MenuCategory"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Payment
-- =========================================================

ALTER TABLE "Payment"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- PaymentTransaction
-- =========================================================
-- updatedAt merupakan kolom baru.
-- createdAt sudah ada sehingga data lama bisa
-- digunakan sebagai nilai awal updatedAt.


ALTER TABLE "PaymentTransaction"
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3);


UPDATE "PaymentTransaction"
SET "updatedAt" = "createdAt" AT TIME ZONE 'UTC';


ALTER TABLE "PaymentTransaction"
  ALTER COLUMN "updatedAt" SET NOT NULL;


ALTER TABLE "PaymentTransaction"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC';


-- =========================================================
-- PembelianBahan
-- =========================================================

ALTER TABLE "PembelianBahan"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- PenjualanDetail
-- =========================================================
-- updatedAt merupakan kolom baru.
-- createdAt sudah ada.


ALTER TABLE "PenjualanDetail"
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3);


UPDATE "PenjualanDetail"
SET "updatedAt" = "createdAt" AT TIME ZONE 'UTC';


ALTER TABLE "PenjualanDetail"
  ALTER COLUMN "updatedAt" SET NOT NULL;


ALTER TABLE "PenjualanDetail"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC';


-- =========================================================
-- PenjualanPayment
-- =========================================================

ALTER TABLE "PenjualanPayment"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Role
-- =========================================================

ALTER TABLE "Role"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- StockOpname
-- =========================================================

ALTER TABLE "StockOpname"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- StockOpnameDetail
-- =========================================================

ALTER TABLE "StockOpnameDetail"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- StokMutasi
-- =========================================================

ALTER TABLE "StokMutasi"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';


-- =========================================================
-- Supplier
-- =========================================================

ALTER TABLE "Supplier"
  ALTER COLUMN "createdAt"
    TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"
    TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';