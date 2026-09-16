-- Stage 11: notifications domain (Notification, NotificationPreference, NotificationOutbox).
-- Purely additive: three new tables, three enums and their indexes. Nothing existing is touched.
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_CANCELLED', 'PAYMENT_CREATED', 'PAYMENT_SUBMITTED_FOR_REVIEW', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED', 'VERIFICATION_STARTED', 'VERIFICATION_REVIEWED', 'VERIFICATION_VERIFIED', 'VERIFICATION_REJECTED', 'LOW_STOCK', 'OUT_OF_STOCK', 'PAYMENT_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "event_key" TEXT NOT NULL,
    "provider" TEXT,
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "event_type" "NotificationType" NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "recipient_user_id" TEXT,
    "permission_key" TEXT,
    "payload" JSONB NOT NULL,
    "event_key" TEXT NOT NULL,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_event_key_idx" ON "notifications"("event_key");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_event_key_key" ON "notifications"("user_id", "event_key");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_type_key" ON "notification_preferences"("user_id", "type");

-- CreateIndex
CREATE INDEX "notification_outbox_status_available_at_idx" ON "notification_outbox"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_event_type_aggregate_type_aggregate_id_key" ON "notification_outbox"("event_type", "aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

