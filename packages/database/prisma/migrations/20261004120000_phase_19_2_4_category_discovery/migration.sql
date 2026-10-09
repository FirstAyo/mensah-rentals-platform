ALTER TABLE "Product" ADD COLUMN "descriptionDocument" JSONB;

ALTER TABLE "CategoryCover"
ADD COLUMN "isDecorative" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CategorySupportingVisual" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "homepageMediaId" TEXT,
  "productImageId" TEXT,
  "altText" VARCHAR(300) NOT NULL,
  "focalPoint" VARCHAR(20) NOT NULL DEFAULT 'center',
  "isDecorative" BOOLEAN NOT NULL DEFAULT false,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CategorySupportingVisual_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CategorySupportingVisual_exactly_one_source" CHECK (
    (("homepageMediaId" IS NOT NULL)::integer + ("productImageId" IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT "CategorySupportingVisual_focal_point" CHECK (
    "focalPoint" IN ('center', 'top', 'bottom', 'left', 'right')
  ),
  CONSTRAINT "CategorySupportingVisual_alt_semantics" CHECK (
    ("isDecorative" = true AND "altText" = '') OR
    ("isDecorative" = false AND length(btrim("altText")) > 0)
  )
);

CREATE UNIQUE INDEX "CategorySupportingVisual_categoryId_sortOrder_key"
ON "CategorySupportingVisual"("categoryId", "sortOrder");
CREATE INDEX "CategorySupportingVisual_homepageMediaId_idx"
ON "CategorySupportingVisual"("homepageMediaId");
CREATE INDEX "CategorySupportingVisual_productImageId_idx"
ON "CategorySupportingVisual"("productImageId");
CREATE INDEX "CategorySupportingVisual_updatedByUserId_updatedAt_idx"
ON "CategorySupportingVisual"("updatedByUserId", "updatedAt");
CREATE INDEX "Product_isActive_createdAt_id_idx"
ON "Product"("isActive", "createdAt", "id");
CREATE INDEX "Product_categoryId_isActive_createdAt_id_idx"
ON "Product"("categoryId", "isActive", "createdAt", "id");

ALTER TABLE "CategorySupportingVisual"
ADD CONSTRAINT "CategorySupportingVisual_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategorySupportingVisual"
ADD CONSTRAINT "CategorySupportingVisual_homepageMediaId_fkey"
FOREIGN KEY ("homepageMediaId") REFERENCES "HomepageMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategorySupportingVisual"
ADD CONSTRAINT "CategorySupportingVisual_productImageId_fkey"
FOREIGN KEY ("productImageId") REFERENCES "ProductImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategorySupportingVisual"
ADD CONSTRAINT "CategorySupportingVisual_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
