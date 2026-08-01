-- Phase 16.4A is additive: existing homepage revisions, catalogue rows, and media
-- references remain unchanged.
ALTER TABLE "HomepageMediaPlacement"
  ALTER COLUMN "mediaId" DROP NOT NULL,
  ADD COLUMN "productImageId" TEXT;

ALTER TABLE "HomepageMediaPlacement"
  ADD CONSTRAINT "HomepageMediaPlacement_productImageId_fkey"
  FOREIGN KEY ("productImageId") REFERENCES "ProductImage"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HomepageMediaPlacement_exactly_one_source_check"
  CHECK (num_nonnulls("mediaId", "productImageId") = 1);

CREATE INDEX "HomepageMediaPlacement_productImageId_idx"
  ON "HomepageMediaPlacement"("productImageId");

ALTER TABLE "HomepageFeaturedCategory"
  ADD COLUMN "coverHomepageMediaId" TEXT,
  ADD COLUMN "coverProductImageId" TEXT,
  ADD COLUMN "coverAltText" VARCHAR(300),
  ADD COLUMN "coverFocalPoint" VARCHAR(20);

ALTER TABLE "HomepageFeaturedCategory"
  ADD CONSTRAINT "HomepageFeaturedCategory_coverHomepageMediaId_fkey"
  FOREIGN KEY ("coverHomepageMediaId") REFERENCES "HomepageMedia"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HomepageFeaturedCategory_coverProductImageId_fkey"
  FOREIGN KEY ("coverProductImageId") REFERENCES "ProductImage"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HomepageFeaturedCategory_at_most_one_cover_check"
  CHECK (num_nonnulls("coverHomepageMediaId", "coverProductImageId") <= 1);

CREATE INDEX "HomepageFeaturedCategory_coverHomepageMediaId_idx"
  ON "HomepageFeaturedCategory"("coverHomepageMediaId");
CREATE INDEX "HomepageFeaturedCategory_coverProductImageId_idx"
  ON "HomepageFeaturedCategory"("coverProductImageId");

CREATE TABLE "CategoryCover" (
  "categoryId" TEXT NOT NULL,
  "homepageMediaId" TEXT,
  "productImageId" TEXT,
  "altText" VARCHAR(300) NOT NULL,
  "focalPoint" VARCHAR(20) NOT NULL DEFAULT 'center',
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CategoryCover_pkey" PRIMARY KEY ("categoryId"),
  CONSTRAINT "CategoryCover_exactly_one_source_check"
    CHECK (num_nonnulls("homepageMediaId", "productImageId") = 1),
  CONSTRAINT "CategoryCover_focal_point_check"
    CHECK ("focalPoint" IN ('center', 'top', 'bottom', 'left', 'right')),
  CONSTRAINT "CategoryCover_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CategoryCover_homepageMediaId_fkey"
    FOREIGN KEY ("homepageMediaId") REFERENCES "HomepageMedia"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CategoryCover_productImageId_fkey"
    FOREIGN KEY ("productImageId") REFERENCES "ProductImage"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CategoryCover_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CategoryCover_homepageMediaId_idx" ON "CategoryCover"("homepageMediaId");
CREATE INDEX "CategoryCover_productImageId_idx" ON "CategoryCover"("productImageId");
CREATE INDEX "CategoryCover_updatedByUserId_updatedAt_idx"
  ON "CategoryCover"("updatedByUserId", "updatedAt");
