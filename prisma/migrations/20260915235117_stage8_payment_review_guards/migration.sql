-- Stage 8 guards: a payment awaiting review must carry the transfer evidence,
-- and a SUCCEEDED payment must always trace back to either a manual transfer
-- reference or a provider payment id ("no success without evidence").
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_review_requires_reference"
    CHECK ("status" <> 'PENDING_REVIEW' OR "transaction_reference" IS NOT NULL),
  ADD CONSTRAINT "payments_review_requires_proof"
    CHECK ("status" <> 'PENDING_REVIEW' OR "proof_url" IS NOT NULL),
  ADD CONSTRAINT "payments_success_requires_evidence"
    CHECK ("status" <> 'SUCCEEDED' OR "transaction_reference" IS NOT NULL OR "provider_payment_id" IS NOT NULL);
