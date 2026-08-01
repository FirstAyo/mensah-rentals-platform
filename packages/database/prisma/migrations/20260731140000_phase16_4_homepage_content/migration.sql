-- Phase 16.4 is additive. It creates homepage content-management records only.
CREATE TYPE "HomepageRevisionKind" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "HomepageActivityType" AS ENUM ('DRAFT_CREATED', 'PUBLISHED', 'RESTORED', 'MEDIA_UPLOADED', 'MEDIA_REMOVED');

CREATE TABLE "HomepageSite" (
  "id" TEXT NOT NULL,
  "draftRevisionId" TEXT,
  "publishedRevisionId" TEXT,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "HomepageSite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HomepageSite_lockVersion_check" CHECK ("lockVersion" >= 0)
);

CREATE TABLE "HomepageRevision" (
  "id" TEXT NOT NULL,
  "homepageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "kind" "HomepageRevisionKind" NOT NULL,
  "content" JSONB NOT NULL,
  "basedOnRevisionId" TEXT,
  "restoredFromRevisionId" TEXT,
  "operationId" TEXT,
  "payloadHash" CHAR(64),
  "createdByUserId" TEXT NOT NULL,
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "HomepageRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HomepageRevision_version_check" CHECK ("version" > 0)
);

CREATE TABLE "HomepageFeaturedCategory" (
  "revisionId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "HomepageFeaturedCategory_pkey" PRIMARY KEY ("revisionId", "categoryId"),
  CONSTRAINT "HomepageFeaturedCategory_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "HomepageFeaturedProduct" (
  "revisionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "HomepageFeaturedProduct_pkey" PRIMARY KEY ("revisionId", "productId"),
  CONSTRAINT "HomepageFeaturedProduct_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "HomepageMedia" (
  "id" TEXT NOT NULL,
  "contentHash" CHAR(64) NOT NULL,
  "url" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "format" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomepageMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HomepageMedia_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "byteSize" > 0)
);

CREATE TABLE "HomepageMediaPlacement" (
  "revisionId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "HomepageMediaPlacement_pkey" PRIMARY KEY ("revisionId", "slotKey"),
  CONSTRAINT "HomepageMediaPlacement_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "HomepageActivity" (
  "id" TEXT NOT NULL,
  "homepageId" TEXT NOT NULL,
  "revisionId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "type" "HomepageActivityType" NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomepageActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HomepageSite_draftRevisionId_key" ON "HomepageSite"("draftRevisionId");
CREATE UNIQUE INDEX "HomepageSite_publishedRevisionId_key" ON "HomepageSite"("publishedRevisionId");
CREATE UNIQUE INDEX "HomepageRevision_operationId_key" ON "HomepageRevision"("operationId");
CREATE UNIQUE INDEX "HomepageRevision_homepageId_version_key" ON "HomepageRevision"("homepageId", "version");
CREATE INDEX "HomepageRevision_homepageId_kind_createdAt_idx" ON "HomepageRevision"("homepageId", "kind", "createdAt");
CREATE INDEX "HomepageRevision_createdByUserId_createdAt_idx" ON "HomepageRevision"("createdByUserId", "createdAt");
CREATE INDEX "HomepageRevision_publishedByUserId_publishedAt_idx" ON "HomepageRevision"("publishedByUserId", "publishedAt");
CREATE UNIQUE INDEX "HomepageFeaturedCategory_revisionId_sortOrder_key" ON "HomepageFeaturedCategory"("revisionId", "sortOrder");
CREATE INDEX "HomepageFeaturedCategory_categoryId_idx" ON "HomepageFeaturedCategory"("categoryId");
CREATE UNIQUE INDEX "HomepageFeaturedProduct_revisionId_sortOrder_key" ON "HomepageFeaturedProduct"("revisionId", "sortOrder");
CREATE INDEX "HomepageFeaturedProduct_productId_idx" ON "HomepageFeaturedProduct"("productId");
CREATE UNIQUE INDEX "HomepageMedia_contentHash_key" ON "HomepageMedia"("contentHash");
CREATE INDEX "HomepageMedia_createdByUserId_createdAt_idx" ON "HomepageMedia"("createdByUserId", "createdAt");
CREATE INDEX "HomepageMediaPlacement_mediaId_idx" ON "HomepageMediaPlacement"("mediaId");
CREATE INDEX "HomepageActivity_homepageId_createdAt_id_idx" ON "HomepageActivity"("homepageId", "createdAt", "id");
CREATE INDEX "HomepageActivity_revisionId_createdAt_idx" ON "HomepageActivity"("revisionId", "createdAt");
CREATE INDEX "HomepageActivity_actorUserId_createdAt_idx" ON "HomepageActivity"("actorUserId", "createdAt");

ALTER TABLE "HomepageRevision" ADD CONSTRAINT "HomepageRevision_homepageId_fkey" FOREIGN KEY ("homepageId") REFERENCES "HomepageSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageRevision" ADD CONSTRAINT "HomepageRevision_basedOnRevisionId_fkey" FOREIGN KEY ("basedOnRevisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageRevision" ADD CONSTRAINT "HomepageRevision_restoredFromRevisionId_fkey" FOREIGN KEY ("restoredFromRevisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageRevision" ADD CONSTRAINT "HomepageRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageRevision" ADD CONSTRAINT "HomepageRevision_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageSite" ADD CONSTRAINT "HomepageSite_draftRevisionId_fkey" FOREIGN KEY ("draftRevisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageSite" ADD CONSTRAINT "HomepageSite_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageFeaturedCategory" ADD CONSTRAINT "HomepageFeaturedCategory_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageFeaturedCategory" ADD CONSTRAINT "HomepageFeaturedCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageFeaturedProduct" ADD CONSTRAINT "HomepageFeaturedProduct_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageFeaturedProduct" ADD CONSTRAINT "HomepageFeaturedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageMedia" ADD CONSTRAINT "HomepageMedia_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageMediaPlacement" ADD CONSTRAINT "HomepageMediaPlacement_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageMediaPlacement" ADD CONSTRAINT "HomepageMediaPlacement_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "HomepageMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageActivity" ADD CONSTRAINT "HomepageActivity_homepageId_fkey" FOREIGN KEY ("homepageId") REFERENCES "HomepageSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageActivity" ADD CONSTRAINT "HomepageActivity_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomepageActivity" ADD CONSTRAINT "HomepageActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
