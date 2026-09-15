-- Stage 4: catalog (categories, brands, products, images, specs) + inventory foundation.
-- Purely additive: no existing table/column is dropped or rewritten.
-- CreateEnum
CREATE TYPE "SpecificationType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RESERVATION', 'RELEASE', 'SALE', 'RETURN');

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "parent_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "brand_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specification_definitions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "SpecificationType" NOT NULL DEFAULT 'TEXT',
    "unit" TEXT,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specification_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specifications" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "specification_id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" SERIAL NOT NULL,
    "inventory_id" INTEGER NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");

-- CreateIndex
CREATE INDEX "categories_sort_order_idx" ON "categories"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_is_active_idx" ON "brands"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "products_is_featured_idx" ON "products"("is_featured");

-- CreateIndex
CREATE INDEX "products_price_idx" ON "products"("price");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "specification_definitions_key_key" ON "specification_definitions"("key");

-- CreateIndex
CREATE INDEX "specification_definitions_is_active_idx" ON "specification_definitions"("is_active");

-- CreateIndex
CREATE INDEX "specification_definitions_category_id_idx" ON "specification_definitions"("category_id");

-- CreateIndex
CREATE INDEX "product_specifications_specification_id_idx" ON "product_specifications"("specification_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_specifications_product_id_specification_id_key" ON "product_specifications"("product_id", "specification_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_product_id_key" ON "inventory"("product_id");

-- CreateIndex
CREATE INDEX "inventory_quantity_idx" ON "inventory"("quantity");

-- CreateIndex
CREATE INDEX "inventory_movements_inventory_id_created_at_idx" ON "inventory_movements"("inventory_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_type_idx" ON "inventory_movements"("type");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specification_definitions" ADD CONSTRAINT "specification_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_specification_id_fkey" FOREIGN KEY ("specification_id") REFERENCES "specification_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Stage 4: database-level integrity safeguards (Prisma cannot express CHECKs)
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_non_negative" CHECK ("price" >= 0),
  ADD CONSTRAINT "products_compare_at_price_gte_price" CHECK ("compare_at_price" IS NULL OR "compare_at_price" >= "price");
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantity_non_negative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "inventory_reserved_non_negative" CHECK ("reserved_quantity" >= 0),
  ADD CONSTRAINT "inventory_reserved_lte_quantity" CHECK ("reserved_quantity" <= "quantity"),
  ADD CONSTRAINT "inventory_low_stock_non_negative" CHECK ("low_stock_threshold" >= 0);
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_images_one_primary_per_product"
  ON "product_images" ("product_id") WHERE "is_primary" = true;
