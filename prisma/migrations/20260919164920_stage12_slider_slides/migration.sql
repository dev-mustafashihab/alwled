-- CreateTable
CREATE TABLE "slider_slides" (
    "id" SERIAL NOT NULL,
    "desktop_image_url" TEXT NOT NULL,
    "mobile_image_url" TEXT,
    "alt_text" TEXT,
    "link_url" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "cta_label" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slider_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "slider_slides_is_enabled_sort_order_idx" ON "slider_slides"("is_enabled", "sort_order");
