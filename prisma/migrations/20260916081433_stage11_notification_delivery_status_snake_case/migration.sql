-- Stage 11 follow-up: align notifications.deliveryStatus with the project's snake_case column convention.
-- Rename only: no data change, no other table touched.
-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "deliveryStatus",
ADD COLUMN     "delivery_status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING';

