-- CreateEnum
CREATE TYPE "public"."CustomerSubmissionMode" AS ENUM ('EMAIL_INQUIRY', 'PLATFORM_REQUEST');

-- CreateEnum
CREATE TYPE "public"."CartEnquiryStatus" AS ENUM ('NEW', 'READ', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."OutboundEmailPurpose" AS ENUM ('CART_ENQUIRY_COMPANY', 'CART_ENQUIRY_CUSTOMER_ACKNOWLEDGEMENT');

-- CreateEnum
CREATE TYPE "public"."OutboundEmailStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."GalleryServiceType" AS ENUM ('FILM_PRODUCTION', 'EVENTS_FESTIVALS', 'CORPORATE_FUNCTIONS', 'PRIVATE_FUNCTIONS');

-- CreateEnum
CREATE TYPE "public"."GalleryRevisionKind" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "public"."CustomerWorkflowSetting" (
    "id" TEXT NOT NULL DEFAULT 'customer-workflow',
    "mode" "public"."CustomerSubmissionMode" NOT NULL DEFAULT 'EMAIL_INQUIRY',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerWorkflowSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CartEnquiry" (
    "id" TEXT NOT NULL,
    "referenceNumber" VARCHAR(32) NOT NULL,
    "customerName" VARCHAR(160) NOT NULL,
    "contactEmail" VARCHAR(254) NOT NULL,
    "contactPhone" VARCHAR(40) NOT NULL,
    "company" VARCHAR(160),
    "projectName" VARCHAR(180),
    "rentalStartDate" DATE NOT NULL,
    "rentalEndDate" DATE NOT NULL,
    "fulfilmentMethod" "public"."RentalRequestFulfillmentMethod" NOT NULL,
    "location" VARCHAR(300),
    "additionalEquipment" TEXT,
    "customerNotes" TEXT,
    "status" "public"."CartEnquiryStatus" NOT NULL DEFAULT 'NEW',
    "operationId" UUID NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "sourceCartTokenHash" CHAR(64) NOT NULL,
    "statusUpdatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CartEnquiryItem" (
    "id" TEXT NOT NULL,
    "cartEnquiryId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameSnapshot" VARCHAR(200) NOT NULL,
    "productSlugSnapshot" VARCHAR(160) NOT NULL,
    "categoryNameSnapshot" VARCHAR(160) NOT NULL,
    "categorySlugSnapshot" VARCHAR(160) NOT NULL,
    "rentalUnitSnapshot" VARCHAR(80) NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartEnquiryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutboundEmail" (
    "id" TEXT NOT NULL,
    "cartEnquiryId" TEXT NOT NULL,
    "purpose" "public"."OutboundEmailPurpose" NOT NULL,
    "status" "public"."OutboundEmailStatus" NOT NULL DEFAULT 'QUEUED',
    "recipient" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(240) NOT NULL,
    "textBody" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "lockedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "providerMessageId" VARCHAR(300),
    "lastErrorCode" VARCHAR(80),
    "lastErrorMessage" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutboundEmailAttempt" (
    "id" TEXT NOT NULL,
    "outboundEmailId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" VARCHAR(40) NOT NULL,
    "safeErrorCode" VARCHAR(80),
    "safeErrorMessage" VARCHAR(500),
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HomepageFeaturedGalleryProject" (
    "revisionId" TEXT NOT NULL,
    "galleryProjectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "HomepageFeaturedGalleryProject_pkey" PRIMARY KEY ("revisionId","galleryProjectId")
);

-- CreateTable
CREATE TABLE "public"."GalleryProject" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "draftRevisionId" TEXT,
    "publishedRevisionId" TEXT,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GalleryProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GalleryProjectRevision" (
    "id" TEXT NOT NULL,
    "galleryProjectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "public"."GalleryRevisionKind" NOT NULL,
    "slugSnapshot" VARCHAR(160) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "serviceType" "public"."GalleryServiceType" NOT NULL,
    "shortDescription" VARCHAR(400) NOT NULL,
    "description" TEXT,
    "eventDate" DATE,
    "location" VARCHAR(240),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(180),
    "basedOnRevisionId" TEXT,
    "restoredFromRevisionId" TEXT,
    "operationId" UUID,
    "payloadHash" CHAR(64),
    "createdByUserId" TEXT NOT NULL,
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GalleryProjectRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GalleryProjectRevisionMedia" (
    "revisionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "altText" VARCHAR(300) NOT NULL,
    "focalPoint" VARCHAR(20) NOT NULL DEFAULT 'center',
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "GalleryProjectRevisionMedia_pkey" PRIMARY KEY ("revisionId","mediaId")
);

-- CreateIndex
CREATE INDEX "CustomerWorkflowSetting_updatedByUserId_updatedAt_idx" ON "public"."CustomerWorkflowSetting"("updatedByUserId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartEnquiry_referenceNumber_key" ON "public"."CartEnquiry"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CartEnquiry_operationId_key" ON "public"."CartEnquiry"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "CartEnquiry_sourceCartTokenHash_key" ON "public"."CartEnquiry"("sourceCartTokenHash");

-- CreateIndex
CREATE INDEX "CartEnquiry_status_createdAt_id_idx" ON "public"."CartEnquiry"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CartEnquiry_contactEmail_createdAt_idx" ON "public"."CartEnquiry"("contactEmail", "createdAt");

-- CreateIndex
CREATE INDEX "CartEnquiry_statusUpdatedByUserId_updatedAt_idx" ON "public"."CartEnquiry"("statusUpdatedByUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "CartEnquiryItem_productId_idx" ON "public"."CartEnquiryItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CartEnquiryItem_cartEnquiryId_productId_key" ON "public"."CartEnquiryItem"("cartEnquiryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CartEnquiryItem_cartEnquiryId_sortOrder_key" ON "public"."CartEnquiryItem"("cartEnquiryId", "sortOrder");

-- CreateIndex
CREATE INDEX "OutboundEmail_status_nextAttemptAt_createdAt_idx" ON "public"."OutboundEmail"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEmail_cartEnquiryId_purpose_key" ON "public"."OutboundEmail"("cartEnquiryId", "purpose");

-- CreateIndex
CREATE INDEX "OutboundEmailAttempt_attemptedAt_id_idx" ON "public"."OutboundEmailAttempt"("attemptedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEmailAttempt_outboundEmailId_attemptNumber_key" ON "public"."OutboundEmailAttempt"("outboundEmailId", "attemptNumber");

-- CreateIndex
CREATE INDEX "HomepageFeaturedGalleryProject_galleryProjectId_idx" ON "public"."HomepageFeaturedGalleryProject"("galleryProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "HomepageFeaturedGalleryProject_revisionId_sortOrder_key" ON "public"."HomepageFeaturedGalleryProject"("revisionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryProject_slug_key" ON "public"."GalleryProject"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryProject_draftRevisionId_key" ON "public"."GalleryProject"("draftRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryProject_publishedRevisionId_key" ON "public"."GalleryProject"("publishedRevisionId");

-- CreateIndex
CREATE INDEX "GalleryProject_archivedAt_updatedAt_id_idx" ON "public"."GalleryProject"("archivedAt", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "GalleryProject_createdByUserId_createdAt_idx" ON "public"."GalleryProject"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryProjectRevision_operationId_key" ON "public"."GalleryProjectRevision"("operationId");

-- CreateIndex
CREATE INDEX "GalleryProjectRevision_galleryProjectId_kind_createdAt_idx" ON "public"."GalleryProjectRevision"("galleryProjectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryProjectRevision_serviceType_featured_sortOrder_creat_idx" ON "public"."GalleryProjectRevision"("serviceType", "featured", "sortOrder", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryProjectRevision_createdByUserId_createdAt_idx" ON "public"."GalleryProjectRevision"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryProjectRevision_galleryProjectId_version_key" ON "public"."GalleryProjectRevision"("galleryProjectId", "version");

-- CreateIndex
CREATE INDEX "GalleryProjectRevisionMedia_mediaId_idx" ON "public"."GalleryProjectRevisionMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryProjectRevisionMedia_revisionId_sortOrder_key" ON "public"."GalleryProjectRevisionMedia"("revisionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "public"."CustomerWorkflowSetting" ADD CONSTRAINT "CustomerWorkflowSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartEnquiry" ADD CONSTRAINT "CartEnquiry_statusUpdatedByUserId_fkey" FOREIGN KEY ("statusUpdatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartEnquiryItem" ADD CONSTRAINT "CartEnquiryItem_cartEnquiryId_fkey" FOREIGN KEY ("cartEnquiryId") REFERENCES "public"."CartEnquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartEnquiryItem" ADD CONSTRAINT "CartEnquiryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutboundEmail" ADD CONSTRAINT "OutboundEmail_cartEnquiryId_fkey" FOREIGN KEY ("cartEnquiryId") REFERENCES "public"."CartEnquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutboundEmailAttempt" ADD CONSTRAINT "OutboundEmailAttempt_outboundEmailId_fkey" FOREIGN KEY ("outboundEmailId") REFERENCES "public"."OutboundEmail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomepageFeaturedGalleryProject" ADD CONSTRAINT "HomepageFeaturedGalleryProject_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "public"."HomepageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomepageFeaturedGalleryProject" ADD CONSTRAINT "HomepageFeaturedGalleryProject_galleryProjectId_fkey" FOREIGN KEY ("galleryProjectId") REFERENCES "public"."GalleryProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProject" ADD CONSTRAINT "GalleryProject_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProject" ADD CONSTRAINT "GalleryProject_draftRevisionId_fkey" FOREIGN KEY ("draftRevisionId") REFERENCES "public"."GalleryProjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProject" ADD CONSTRAINT "GalleryProject_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "public"."GalleryProjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProjectRevision" ADD CONSTRAINT "GalleryProjectRevision_galleryProjectId_fkey" FOREIGN KEY ("galleryProjectId") REFERENCES "public"."GalleryProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProjectRevision" ADD CONSTRAINT "GalleryProjectRevision_basedOnRevisionId_fkey" FOREIGN KEY ("basedOnRevisionId") REFERENCES "public"."GalleryProjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProjectRevision" ADD CONSTRAINT "GalleryProjectRevision_restoredFromRevisionId_fkey" FOREIGN KEY ("restoredFromRevisionId") REFERENCES "public"."GalleryProjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProjectRevision" ADD CONSTRAINT "GalleryProjectRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProjectRevision" ADD CONSTRAINT "GalleryProjectRevision_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProjectRevisionMedia" ADD CONSTRAINT "GalleryProjectRevisionMedia_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "public"."GalleryProjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GalleryProjectRevisionMedia" ADD CONSTRAINT "GalleryProjectRevisionMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "public"."HomepageMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the one authoritative launch-mode row without changing existing data.
INSERT INTO "public"."CustomerWorkflowSetting" (
  "id", "mode", "version", "createdAt", "updatedAt"
) VALUES (
  'customer-workflow', 'EMAIL_INQUIRY', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "public"."CartEnquiry"
  ADD CONSTRAINT "CartEnquiry_rental_dates_check"
    CHECK ("rentalEndDate" >= "rentalStartDate");

ALTER TABLE "public"."CartEnquiryItem"
  ADD CONSTRAINT "CartEnquiryItem_quantity_check"
    CHECK ("requestedQuantity" > 0),
  ADD CONSTRAINT "CartEnquiryItem_sort_order_check"
    CHECK ("sortOrder" >= 0);

ALTER TABLE "public"."OutboundEmail"
  ADD CONSTRAINT "OutboundEmail_attempt_count_check"
    CHECK ("attemptCount" >= 0),
  ADD CONSTRAINT "OutboundEmail_sent_state_check"
    CHECK (("status" = 'SENT' AND "sentAt" IS NOT NULL) OR ("status" <> 'SENT' AND "sentAt" IS NULL));

ALTER TABLE "public"."OutboundEmailAttempt"
  ADD CONSTRAINT "OutboundEmailAttempt_number_check"
    CHECK ("attemptNumber" > 0);

ALTER TABLE "public"."GalleryProjectRevision"
  ADD CONSTRAINT "GalleryProjectRevision_publish_state_check"
    CHECK (("kind" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "publishedByUserId" IS NOT NULL)
      OR ("kind" = 'DRAFT' AND "publishedAt" IS NULL AND "publishedByUserId" IS NULL)),
  ADD CONSTRAINT "GalleryProjectRevision_sort_order_check"
    CHECK ("sortOrder" >= 0);

ALTER TABLE "public"."GalleryProjectRevisionMedia"
  ADD CONSTRAINT "GalleryProjectRevisionMedia_sort_order_check"
    CHECK ("sortOrder" >= 0),
  ADD CONSTRAINT "GalleryProjectRevisionMedia_focal_point_check"
    CHECK ("focalPoint" IN ('center', 'top', 'bottom', 'left', 'right'));

CREATE OR REPLACE FUNCTION "public"."protect_cart_enquiry_snapshot"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cart enquiry history is immutable';
  END IF;
  IF ROW(
    NEW."referenceNumber", NEW."customerName", NEW."contactEmail", NEW."contactPhone",
    NEW."company", NEW."projectName", NEW."rentalStartDate", NEW."rentalEndDate",
    NEW."fulfilmentMethod", NEW."location", NEW."additionalEquipment", NEW."customerNotes",
    NEW."operationId", NEW."payloadHash", NEW."sourceCartTokenHash", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."referenceNumber", OLD."customerName", OLD."contactEmail", OLD."contactPhone",
    OLD."company", OLD."projectName", OLD."rentalStartDate", OLD."rentalEndDate",
    OLD."fulfilmentMethod", OLD."location", OLD."additionalEquipment", OLD."customerNotes",
    OLD."operationId", OLD."payloadHash", OLD."sourceCartTokenHash", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Cart enquiry submission snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CartEnquiry_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "public"."CartEnquiry"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_cart_enquiry_snapshot"();

CREATE OR REPLACE FUNCTION "public"."protect_append_only_row"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% history is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CartEnquiryItem_append_only"
BEFORE UPDATE OR DELETE ON "public"."CartEnquiryItem"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_append_only_row"();

CREATE TRIGGER "OutboundEmailAttempt_append_only"
BEFORE UPDATE OR DELETE ON "public"."OutboundEmailAttempt"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_append_only_row"();

CREATE TRIGGER "GalleryProjectRevision_append_only"
BEFORE UPDATE OR DELETE ON "public"."GalleryProjectRevision"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_append_only_row"();

CREATE TRIGGER "GalleryProjectRevisionMedia_append_only"
BEFORE UPDATE OR DELETE ON "public"."GalleryProjectRevisionMedia"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_append_only_row"();

CREATE TRIGGER "HomepageFeaturedGalleryProject_append_only"
BEFORE UPDATE OR DELETE ON "public"."HomepageFeaturedGalleryProject"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_append_only_row"();

CREATE OR REPLACE FUNCTION "public"."validate_gallery_project_heads"()
RETURNS trigger AS $$
BEGIN
  IF NEW."draftRevisionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."GalleryProjectRevision"
    WHERE "id" = NEW."draftRevisionId"
      AND "galleryProjectId" = NEW."id"
      AND "kind" = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Gallery draft head must reference this project';
  END IF;
  IF NEW."publishedRevisionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."GalleryProjectRevision"
    WHERE "id" = NEW."publishedRevisionId"
      AND "galleryProjectId" = NEW."id"
      AND "kind" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Gallery published head must reference this project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "GalleryProject_head_integrity"
AFTER INSERT OR UPDATE OF "draftRevisionId", "publishedRevisionId"
ON "public"."GalleryProject"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."validate_gallery_project_heads"();
