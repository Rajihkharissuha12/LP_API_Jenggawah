-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."IdentityType" AS ENUM ('KTP', 'SIM', 'PEL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."PricingType" AS ENUM ('PER_TICKET', 'PER_HOUR', 'PER_DAY');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('NEW', 'APPROVED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'DP', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'TRANSFER_MANUAL', 'QRIS_OFFLINE');

-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('DP', 'PAID', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."VerificationMethod" AS ENUM ('NONE', 'WHATSAPP', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."AvailabilityType" AS ENUM ('OPEN', 'BLOCK');

-- CreateTable
CREATE TABLE "public"."Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "identityType" "public"."IdentityType",
    "identityNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricingType" "public"."PricingType" NOT NULL,
    "minDuration" INTEGER,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FacilityAvailability" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "type" "public"."AvailabilityType" NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "repeatRule" JSONB,

    CONSTRAINT "FacilityAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FacilityClosure" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "FacilityClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingRule" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "bookingWindowDays" INTEGER,
    "advanceNoticeHours" INTEGER,
    "prepBufferBeforeMin" INTEGER,
    "prepBufferAfterMin" INTEGER,
    "maxParticipants" INTEGER,

    CONSTRAINT "BookingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "participants" INTEGER NOT NULL,
    "purpose" TEXT,
    "status" "public"."BookingStatus" NOT NULL,
    "adminNote" TEXT,
    "verificationMethod" "public"."VerificationMethod" NOT NULL DEFAULT 'NONE',
    "verifiedAt" TIMESTAMP(3),
    "source" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "unitType" "public"."PricingType" NOT NULL,
    "unitCount" INTEGER,
    "price" DECIMAL(12,2) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL,
    "totalDue" DECIMAL(12,2) NOT NULL,
    "totalPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastTransactionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentTransaction" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "public"."TransactionType" NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "receiptNumber" TEXT,
    "cashierId" TEXT,
    "paidAt" TIMESTAMP(3),
    "locationId" TEXT,
    "proofUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "paymentId" TEXT NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "locationId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceList" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "pricingType" "public"."PricingType" NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "minDuration" INTEGER,
    "maxDuration" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceAdjustment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rule" JSONB NOT NULL,
    "valueType" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "PriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "customerId" TEXT NOT NULL,
    "adminId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "direction" TEXT NOT NULL DEFAULT 'OUT',
    "messageSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingId" TEXT,
    "adminId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "public"."Admin"("username");

-- CreateIndex
CREATE INDEX "FacilityAvailability_facilityId_date_idx" ON "public"."FacilityAvailability"("facilityId", "date");

-- CreateIndex
CREATE INDEX "FacilityClosure_facilityId_startAt_endAt_idx" ON "public"."FacilityClosure"("facilityId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRule_facilityId_key" ON "public"."BookingRule"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "public"."Booking"("bookingCode");

-- CreateIndex
CREATE INDEX "Booking_facilityId_bookingDate_idx" ON "public"."Booking"("facilityId", "bookingDate");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "public"."Booking"("status");

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_date_idx" ON "public"."BookingItem"("bookingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "public"."Payment"("bookingId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_bookingId_createdAt_idx" ON "public"."PaymentTransaction"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceList_facilityId_effectiveFrom_idx" ON "public"."PriceList"("facilityId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ContactLog_customerId_createdAt_idx" ON "public"."ContactLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactLog_bookingId_createdAt_idx" ON "public"."ContactLog"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "public"."AuditLog"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_bookingId_createdAt_idx" ON "public"."AuditLog"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_createdAt_idx" ON "public"."AuditLog"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."FacilityAvailability" ADD CONSTRAINT "FacilityAvailability_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "public"."Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FacilityClosure" ADD CONSTRAINT "FacilityClosure_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "public"."Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingRule" ADD CONSTRAINT "BookingRule_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "public"."Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "public"."Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashSession" ADD CONSTRAINT "CashSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceList" ADD CONSTRAINT "PriceList_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "public"."Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "public"."Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactLog" ADD CONSTRAINT "ContactLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactLog" ADD CONSTRAINT "ContactLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactLog" ADD CONSTRAINT "ContactLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
