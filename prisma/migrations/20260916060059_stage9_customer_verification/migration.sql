-- Stage 9: customer verification workflow (provider-independent, LOG provider only).
-- Purely additive: new enums, new table, indexes and CHECK guards. No existing data is touched.
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('MANUAL', 'PROVIDER', 'SYSTEM');

-- CreateTable
CREATE TABLE "customer_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "provider_reference" TEXT,
    "source" "VerificationSource" NOT NULL DEFAULT 'SYSTEM',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_verifications_user_id_created_at_idx" ON "customer_verifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_verifications_status_idx" ON "customer_verifications"("status");

-- CreateIndex
CREATE INDEX "customer_verifications_created_at_idx" ON "customer_verifications"("created_at");

-- CreateIndex
CREATE INDEX "customer_verifications_expires_at_idx" ON "customer_verifications"("expires_at");

-- AddForeignKey
ALTER TABLE "customer_verifications" ADD CONSTRAINT "customer_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_verifications" ADD CONSTRAINT "customer_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Stage 9 guards (Prisma cannot express these)
-- 1) A provider reference can only exist when a provider is recorded.
ALTER TABLE "customer_verifications"
  ADD CONSTRAINT "verification_reference_requires_provider"
    CHECK ("provider_reference" IS NULL OR "provider" IS NOT NULL),
  ADD CONSTRAINT "verification_rejection_requires_reason"
    CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL),
  ADD CONSTRAINT "verification_review_fields_together"
    CHECK (("reviewed_by" IS NULL AND "reviewed_at" IS NULL) OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
  ADD CONSTRAINT "verification_terminal_requires_completion"
    CHECK ("status" NOT IN ('VERIFIED', 'REJECTED', 'CANCELLED') OR "completed_at" IS NOT NULL),
  ADD CONSTRAINT "verification_attempt_positive" CHECK ("attempt" >= 1);

-- 2) At most ONE active verification per user (PENDING or IN_REVIEW).
--    Enforced by the database, so concurrent starts cannot create two actives.
CREATE UNIQUE INDEX "customer_verifications_one_active_per_user"
  ON "customer_verifications" ("user_id")
  WHERE "status" IN ('PENDING', 'IN_REVIEW');
