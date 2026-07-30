-- Add priority column to bookings
ALTER TABLE "bookings" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'regular';

-- CreateTable: calendar_config
CREATE TABLE "calendar_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "calendar_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable: service_buffer_rules
CREATE TABLE "service_buffer_rules" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "bufferBefore" INTEGER NOT NULL DEFAULT 0,
    "bufferAfter" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_buffer_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_buffer_rules_doctorId_service_key" ON "service_buffer_rules"("doctorId", "service");

-- CreateIndex
CREATE INDEX "service_buffer_rules_doctorId_idx" ON "service_buffer_rules"("doctorId");

-- CreateTable: waiting_list_entries
CREATE TABLE "waiting_list_entries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "doctorId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "preferredDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredTimes" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "expiresAt" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiting_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waiting_list_entries_status_idx" ON "waiting_list_entries"("status");

-- CreateIndex
CREATE INDEX "waiting_list_entries_doctorId_idx" ON "waiting_list_entries"("doctorId");

-- CreateIndex
CREATE INDEX "waiting_list_entries_createdAt_idx" ON "waiting_list_entries"("createdAt");

-- CreateTable: appointment_teams
CREATE TABLE "appointment_teams" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "primaryDoctorId" TEXT NOT NULL,
    "teamMembers" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointment_teams_bookingId_key" ON "appointment_teams"("bookingId");

-- CreateIndex
CREATE INDEX "appointment_teams_primaryDoctorId_idx" ON "appointment_teams"("primaryDoctorId");
