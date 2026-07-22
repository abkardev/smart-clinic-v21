-- CreateEnum
CREATE TYPE "CalendarChannelStatus" AS ENUM ('active', 'expiring', 'stopped', 'error');

-- CreateEnum
CREATE TYPE "RecurringSlotType" AS ENUM ('out_of_office', 'vacation', 'meeting', 'personal', 'conference', 'other');

-- AlterTable
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '30 minutes';

-- CreateTable
CREATE TABLE "calendar_channels" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,
    "status" "CalendarChannelStatus" NOT NULL DEFAULT 'active',
    "lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_sync_states" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "syncToken" TEXT,
    "fullSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventId" TEXT,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_calendar_tokens" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "calendarId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_calendar_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_blocked_slots" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "title" TEXT,
    "rrule" TEXT NOT NULL,
    "slotType" "RecurringSlotType" NOT NULL DEFAULT 'other',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isWholeDay" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL DEFAULT '',
    "googleEventId" TEXT,
    "syncedToGoogle" BOOLEAN NOT NULL DEFAULT false,
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_blocked_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_channels_channelId_key" ON "calendar_channels"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_channels_resourceId_key" ON "calendar_channels"("resourceId");

-- CreateIndex
CREATE INDEX "calendar_channels_doctorId_idx" ON "calendar_channels"("doctorId");

-- CreateIndex
CREATE INDEX "calendar_channels_expiration_idx" ON "calendar_channels"("expiration");

-- CreateIndex
CREATE INDEX "calendar_channels_status_idx" ON "calendar_channels"("status");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sync_states_doctorId_key" ON "calendar_sync_states"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_calendar_tokens_doctorId_key" ON "doctor_calendar_tokens"("doctorId");

-- CreateIndex
CREATE INDEX "recurring_blocked_slots_doctorId_idx" ON "recurring_blocked_slots"("doctorId");
