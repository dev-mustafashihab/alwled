-- Stage 7: provider-independent payments + shared idempotency scope.
-- Additive: the only index change is idempotency_keys (userId,key) -> (userId,scope,key),
-- with scope backfilled to 'ORDER' for existing rows. No data is deleted.
-- Existing rows get scope='ORDER' (the default) — see the ALTER below.
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('SHAM_CASH', 'CASH_ON_DELIVERY', 'CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- DropIndex
DROP INDEX "idempotency_keys_user_id_key_key";

-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN     "payment_id" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'ORDER';

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'SHAM_CASH',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "provider" TEXT,
    "provider_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_method_idx" ON "payments"("method");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_scope_key_key" ON "idempotency_keys"("user_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Stage 7 integrity guards (Prisma cannot express CHECK constraints)
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount" >= 0);
