-- Stage 10: dashboard/analytics composite indexes (status + created_at).
-- Additive only: two indexes, justified by the analytics query patterns
-- (aggregate by status over a created_at range). No data or column changes.
-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

