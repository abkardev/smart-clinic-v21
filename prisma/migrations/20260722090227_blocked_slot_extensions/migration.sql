-- AlterTable
ALTER TABLE "blocked_slots" ADD COLUMN     "blockingSource" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "recurringSlotId" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "expiresAt" SET DEFAULT NOW() + INTERVAL '30 minutes';

-- CreateIndex
CREATE INDEX "blocked_slots_recurringSlotId_idx" ON "blocked_slots"("recurringSlotId");

-- AddForeignKey
ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_recurringSlotId_fkey" FOREIGN KEY ("recurringSlotId") REFERENCES "recurring_blocked_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
