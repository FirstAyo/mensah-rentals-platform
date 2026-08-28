CREATE TYPE "PublicPageKey" AS ENUM ('ABOUT', 'CONTACT', 'TERMS', 'PRIVACY');
CREATE TYPE "PublicPageRevisionKind" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "PublicPage" (
  "id" TEXT NOT NULL,
  "key" "PublicPageKey" NOT NULL,
  "draftRevisionId" TEXT,
  "publishedRevisionId" TEXT,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PublicPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicPage_lockVersion_check" CHECK ("lockVersion" >= 0)
);

CREATE TABLE "PublicPageRevision" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "kind" "PublicPageRevisionKind" NOT NULL,
  "content" JSONB NOT NULL,
  "seo" JSONB NOT NULL,
  "basedOnRevisionId" TEXT,
  "restoredFromRevisionId" TEXT,
  "operationId" UUID,
  "payloadHash" CHAR(64),
  "createdByUserId" TEXT,
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PublicPageRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicPageRevision_version_check" CHECK ("version" > 0),
  CONSTRAINT "PublicPageRevision_payloadHash_check" CHECK ("payloadHash" IS NULL OR "payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PublicPageRevision_kind_check" CHECK (
    ("kind" = 'DRAFT' AND "publishedAt" IS NULL AND "publishedByUserId" IS NULL)
    OR ("kind" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
  )
);

CREATE TABLE "PublicPageMediaPlacement" (
  "revisionId" TEXT NOT NULL,
  "slotKey" VARCHAR(120) NOT NULL,
  "mediaId" TEXT,
  "productImageId" TEXT,
  "altText" VARCHAR(240) NOT NULL,
  "focalPoint" VARCHAR(20) NOT NULL DEFAULT 'center',
  CONSTRAINT "PublicPageMediaPlacement_pkey" PRIMARY KEY ("revisionId", "slotKey"),
  CONSTRAINT "PublicPageMediaPlacement_source_check" CHECK (
    (("mediaId" IS NOT NULL)::integer + ("productImageId" IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT "PublicPageMediaPlacement_focal_check" CHECK ("focalPoint" IN ('left', 'center', 'right'))
);

CREATE UNIQUE INDEX "PublicPage_key_key" ON "PublicPage"("key");
CREATE UNIQUE INDEX "PublicPage_draftRevisionId_key" ON "PublicPage"("draftRevisionId");
CREATE UNIQUE INDEX "PublicPage_publishedRevisionId_key" ON "PublicPage"("publishedRevisionId");
CREATE INDEX "PublicPage_updatedAt_key_idx" ON "PublicPage"("updatedAt", "key");
CREATE UNIQUE INDEX "PublicPageRevision_operationId_key" ON "PublicPageRevision"("operationId");
CREATE UNIQUE INDEX "PublicPageRevision_pageId_version_key" ON "PublicPageRevision"("pageId", "version");
CREATE INDEX "PublicPageRevision_pageId_kind_createdAt_idx" ON "PublicPageRevision"("pageId", "kind", "createdAt");
CREATE INDEX "PublicPageRevision_createdByUserId_createdAt_idx" ON "PublicPageRevision"("createdByUserId", "createdAt");
CREATE INDEX "PublicPageRevision_publishedByUserId_publishedAt_idx" ON "PublicPageRevision"("publishedByUserId", "publishedAt");
CREATE INDEX "PublicPageMediaPlacement_mediaId_idx" ON "PublicPageMediaPlacement"("mediaId");
CREATE INDEX "PublicPageMediaPlacement_productImageId_idx" ON "PublicPageMediaPlacement"("productImageId");

ALTER TABLE "PublicPageRevision" ADD CONSTRAINT "PublicPageRevision_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "PublicPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPageRevision" ADD CONSTRAINT "PublicPageRevision_basedOnRevisionId_fkey"
  FOREIGN KEY ("basedOnRevisionId") REFERENCES "PublicPageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPageRevision" ADD CONSTRAINT "PublicPageRevision_restoredFromRevisionId_fkey"
  FOREIGN KEY ("restoredFromRevisionId") REFERENCES "PublicPageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPageRevision" ADD CONSTRAINT "PublicPageRevision_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPageRevision" ADD CONSTRAINT "PublicPageRevision_publishedByUserId_fkey"
  FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPageMediaPlacement" ADD CONSTRAINT "PublicPageMediaPlacement_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "PublicPageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPageMediaPlacement" ADD CONSTRAINT "PublicPageMediaPlacement_mediaId_fkey"
  FOREIGN KEY ("mediaId") REFERENCES "HomepageMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPageMediaPlacement" ADD CONSTRAINT "PublicPageMediaPlacement_productImageId_fkey"
  FOREIGN KEY ("productImageId") REFERENCES "ProductImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPage" ADD CONSTRAINT "PublicPage_draftRevisionId_fkey"
  FOREIGN KEY ("draftRevisionId") REFERENCES "PublicPageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicPage" ADD CONSTRAINT "PublicPage_publishedRevisionId_fkey"
  FOREIGN KEY ("publishedRevisionId") REFERENCES "PublicPageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "protect_public_page_revision"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Public page revisions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PublicPageRevision_immutable_update"
BEFORE UPDATE ON "PublicPageRevision" FOR EACH ROW EXECUTE FUNCTION "protect_public_page_revision"();
CREATE TRIGGER "PublicPageRevision_immutable_delete"
BEFORE DELETE ON "PublicPageRevision" FOR EACH ROW EXECUTE FUNCTION "protect_public_page_revision"();
CREATE TRIGGER "PublicPageMediaPlacement_immutable_update"
BEFORE UPDATE ON "PublicPageMediaPlacement" FOR EACH ROW EXECUTE FUNCTION "protect_public_page_revision"();
CREATE TRIGGER "PublicPageMediaPlacement_immutable_delete"
BEFORE DELETE ON "PublicPageMediaPlacement" FOR EACH ROW EXECUTE FUNCTION "protect_public_page_revision"();
