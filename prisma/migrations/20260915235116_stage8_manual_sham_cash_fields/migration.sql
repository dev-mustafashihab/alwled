-- Stage 8 (manual Sham Cash): PENDING_REVIEW status + transfer reference/proof/review fields.
-- Additive only. The new enum value is NOT referenced in this file (PostgreSQL forbids
-- using a freshly added enum value inside the same transaction) — guards follow in the
-- next migration.
-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "proof_note" TEXT,
ADD COLUMN     "proof_url" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT,
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "transaction_reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_reference_key" ON "payments"("transaction_reference");

-- CreateIndex
CREATE INDEX "payments_submitted_at_idx" ON "payments"("submitted_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

