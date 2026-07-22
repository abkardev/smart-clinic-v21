-- AlterTable
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '30 minutes';

-- CreateTable
CREATE TABLE "processed_notifications" (
    "id" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "messageNumber" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processed_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_notifications_notificationKey_key" ON "processed_notifications"("notificationKey");

-- CreateIndex
CREATE INDEX "processed_notifications_expiresAt_idx" ON "processed_notifications"("expiresAt");

-- CreateIndex
CREATE INDEX "processed_notifications_processedAt_idx" ON "processed_notifications"("processedAt");
