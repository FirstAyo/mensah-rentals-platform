-- Product and category catalogue metadata only. Inventory is intentionally absent.
CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 160),
  CONSTRAINT "Category_slug_check" CHECK (char_length("slug") BETWEEN 1 AND 120 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT "Category_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "shortDescription" TEXT NOT NULL,
  "description" TEXT,
  "rentalUnit" TEXT NOT NULL DEFAULT 'each',
  "categoryId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Product_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 160),
  CONSTRAINT "Product_slug_check" CHECK (char_length("slug") BETWEEN 1 AND 120 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT "Product_shortDescription_check" CHECK (char_length(btrim("shortDescription")) BETWEEN 1 AND 300),
  CONSTRAINT "Product_rentalUnit_check" CHECK (char_length(btrim("rentalUnit")) BETWEEN 1 AND 50)
);

CREATE TABLE "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "altText" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductImage_url_check" CHECK (char_length(btrim("url")) BETWEEN 1 AND 2048),
  CONSTRAINT "ProductImage_altText_check" CHECK (char_length(btrim("altText")) BETWEEN 1 AND 300),
  CONSTRAINT "ProductImage_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "ProductSpecification" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductSpecification_label_check" CHECK (char_length(btrim("label")) BETWEEN 1 AND 100),
  CONSTRAINT "ProductSpecification_value_check" CHECK (char_length(btrim("value")) BETWEEN 1 AND 500),
  CONSTRAINT "ProductSpecification_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_isActive_sortOrder_name_id_idx" ON "Category"("isActive", "sortOrder", "name", "id");
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE INDEX "Product_categoryId_isActive_name_id_idx" ON "Product"("categoryId", "isActive", "name", "id");
CREATE INDEX "Product_isActive_isFeatured_updatedAt_id_idx" ON "Product"("isActive", "isFeatured", "updatedAt", "id");
CREATE UNIQUE INDEX "ProductImage_productId_sortOrder_key" ON "ProductImage"("productId", "sortOrder");
CREATE INDEX "ProductImage_productId_sortOrder_id_idx" ON "ProductImage"("productId", "sortOrder", "id");
CREATE UNIQUE INDEX "ProductImage_one_primary_per_product" ON "ProductImage"("productId") WHERE "isPrimary" = true;
CREATE UNIQUE INDEX "ProductSpecification_productId_sortOrder_key" ON "ProductSpecification"("productId", "sortOrder");
CREATE INDEX "ProductSpecification_productId_sortOrder_id_idx" ON "ProductSpecification"("productId", "sortOrder", "id");

ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
