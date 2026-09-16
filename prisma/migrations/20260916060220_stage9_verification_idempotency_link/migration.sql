-- Stage 9: link the shared idempotency table to verification records (additive).
-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN     "verification_id" TEXT;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "customer_verifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

