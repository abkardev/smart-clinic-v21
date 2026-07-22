-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "calendarLastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '30 minutes';

-- CreateTable
CREATE TABLE "calendar_sync_jobs" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "status" "CalendarSyncStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_sync_jobs_status_nextRetryAt_idx" ON "calendar_sync_jobs"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "calendar_sync_jobs_bookingId_idx" ON "calendar_sync_jobs"("bookingId");

-- RenameIndex
ALTER INDEX "bookings_doctor_id_date_status_idx" RENAME TO "bookings_doctorId_date_status_idx";
