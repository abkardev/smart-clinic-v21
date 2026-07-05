-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "instagramPsid" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '30 minutes';

-- CreateTable
CREATE TABLE "fallback_mappings" (
    "userId" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fallback_mappings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "fallback_mappings_expiresAt_idx" ON "fallback_mappings"("expiresAt");

-- CreateIndex
CREATE INDEX "bookings_instagramPsid_idx" ON "bookings"("instagramPsid");
