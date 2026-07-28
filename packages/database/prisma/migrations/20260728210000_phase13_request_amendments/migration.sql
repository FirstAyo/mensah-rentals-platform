-- Phase 13: immutable rental-request revisions and formal post-acceptance change requests.
ALTER TYPE "RentalRequestStatus" ADD VALUE 'RE_REVIEW_REQUIRED' AFTER 'SUBMITTED';
ALTER TYPE "RentalRequestActivityType" ADD VALUE 'AMENDMENT_SUBMITTED';
ALTER TYPE "RentalRequestActivityType" ADD VALUE 'RE_REVIEW_STARTED';
ALTER TYPE "RentalRequestActivityType" ADD VALUE 'DECISION_SUPERSEDED';
ALTER TYPE "RentalRequestActivityType" ADD VALUE 'QUOTE_SUPERSEDED';
ALTER TYPE "RentalRequestActivityType" ADD VALUE 'QUOTE_ACCESS_REVOKED';
ALTER TYPE "RentalRequestActivityType" ADD VALUE 'CHANGE_REQUEST_SUBMITTED';
ALTER TYPE "RentalRequestActivityType" ADD VALUE 'CHANGE_REQUEST_REVIEWED';

CREATE TYPE "RentalRequestRevisionSubmitterType" AS ENUM ('ORIGINAL_SUBMISSION', 'CUSTOMER', 'STAFF');
CREATE TYPE "RentalChangeRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED_FOR_REQUOTE', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED');
CREATE TYPE "RentalChangeRequestItemType" AS ENUM ('ADDED', 'REMOVED', 'QUANTITY_CHANGED', 'UNCHANGED');

DROP TRIGGER IF EXISTS "RentalRequest_terminal_review_immutable" ON "RentalRequest";
DROP TRIGGER IF EXISTS "RentalRequest_status_transition" ON "RentalRequest";
DROP TRIGGER IF EXISTS "RentalRequest_decision_consistency" ON "RentalRequest";
DROP TRIGGER IF EXISTS "RentalRequestDecision_consistency" ON "RentalRequestDecision";
DROP TRIGGER IF EXISTS "RentalRequestDecisionItem_consistency" ON "RentalRequestDecisionItem";
DROP TRIGGER IF EXISTS "RentalRequestDecisionItem_validate_insert" ON "RentalRequestDecisionItem";
DROP TRIGGER IF EXISTS "RentalRequestDecision_immutable_update" ON "RentalRequestDecision";
DROP TRIGGER IF EXISTS "RentalRequestDecisionItem_immutable_update" ON "RentalRequestDecisionItem";
DROP TRIGGER IF EXISTS "QuoteRevisionItem_source" ON "QuoteRevisionItem";
DROP TRIGGER IF EXISTS "QuoteRevision_source" ON "QuoteRevision";
DROP FUNCTION IF EXISTS protect_terminal_rental_request();
DROP FUNCTION IF EXISTS enforce_rental_request_status_transition();
DROP FUNCTION IF EXISTS validate_rental_request_decision_consistency();
DROP FUNCTION IF EXISTS validate_rental_request_decision_item();
DROP FUNCTION IF EXISTS validate_quote_item_source();
DROP FUNCTION IF EXISTS validate_quote_revision_source();

ALTER TABLE "RentalRequest" ADD COLUMN "currentRevisionId" TEXT;
ALTER TABLE "RentalRequestActivity" ADD COLUMN "revisionId" TEXT;

CREATE TABLE "RentalRequestCustomerAccess" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMPTZ(3),
  CONSTRAINT "RentalRequestCustomerAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestCustomerAccess_expiry_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "RentalRequestCustomerAccess_revocation_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

CREATE TABLE "RentalRequestRevision" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "submittedByType" "RentalRequestRevisionSubmitterType" NOT NULL,
  "submittedByCustomerAccessId" TEXT,
  "createdByStaffUserId" TEXT,
  "amendmentReason" TEXT,
  "contactFirstName" TEXT NOT NULL,
  "contactLastName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "companyName" TEXT,
  "projectName" TEXT NOT NULL,
  "projectType" TEXT NOT NULL,
  "projectLocation" TEXT NOT NULL,
  "fulfillmentMethod" "RentalRequestFulfillmentMethod" NOT NULL,
  "deliveryAddress" TEXT,
  "rentalStartDate" DATE NOT NULL,
  "rentalEndDate" DATE NOT NULL,
  "requestedTimeZone" TEXT NOT NULL,
  "customerNotes" TEXT,
  "operationId" TEXT NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestRevision_number_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "RentalRequestRevision_dates_check" CHECK ("rentalEndDate" >= "rentalStartDate"),
  CONSTRAINT "RentalRequestRevision_submitter_check" CHECK (
    ("submittedByType" = 'ORIGINAL_SUBMISSION' AND "submittedByCustomerAccessId" IS NULL AND "createdByStaffUserId" IS NULL)
    OR ("submittedByType" = 'CUSTOMER' AND "submittedByCustomerAccessId" IS NOT NULL AND "createdByStaffUserId" IS NULL)
    OR ("submittedByType" = 'STAFF' AND "submittedByCustomerAccessId" IS NULL AND "createdByStaffUserId" IS NOT NULL)
  )
);

CREATE TABLE "RentalRequestRevisionItem" (
  "id" TEXT NOT NULL,
  "rentalRequestRevisionId" TEXT NOT NULL,
  "productId" TEXT,
  "productNameSnapshot" TEXT NOT NULL,
  "productSlugSnapshot" TEXT NOT NULL,
  "categoryNameSnapshot" TEXT NOT NULL,
  "categorySlugSnapshot" TEXT NOT NULL,
  "rentalUnitSnapshot" TEXT NOT NULL,
  "primaryImageUrlSnapshot" TEXT,
  "requestedQuantity" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestRevisionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestRevisionItem_quantity_check" CHECK ("requestedQuantity" > 0),
  CONSTRAINT "RentalRequestRevisionItem_sort_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "RentalRequestAmendment" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "baseRevisionId" TEXT NOT NULL,
  "newRevisionId" TEXT NOT NULL,
  "submittedByCustomerAccessId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestAmendment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RentalRequestCustomerAccess_rentalRequestId_tokenHash_key" ON "RentalRequestCustomerAccess"("rentalRequestId", "tokenHash");
CREATE INDEX "RentalRequestCustomerAccess_tokenHash_expiresAt_id_idx" ON "RentalRequestCustomerAccess"("tokenHash", "expiresAt", "id");
CREATE INDEX "RentalRequestCustomerAccess_rentalRequestId_expiresAt_id_idx" ON "RentalRequestCustomerAccess"("rentalRequestId", "expiresAt", "id");
CREATE UNIQUE INDEX "RentalRequestRevision_operationId_key" ON "RentalRequestRevision"("operationId");
CREATE UNIQUE INDEX "RentalRequestRevision_rentalRequestId_revisionNumber_key" ON "RentalRequestRevision"("rentalRequestId", "revisionNumber");
CREATE INDEX "RentalRequestRevision_rentalRequestId_createdAt_id_idx" ON "RentalRequestRevision"("rentalRequestId", "createdAt", "id");
CREATE INDEX "RentalRequestRevision_submittedByCustomerAccessId_createdAt_id_idx" ON "RentalRequestRevision"("submittedByCustomerAccessId", "createdAt", "id");
CREATE INDEX "RentalRequestRevision_createdByStaffUserId_createdAt_id_idx" ON "RentalRequestRevision"("createdByStaffUserId", "createdAt", "id");
CREATE UNIQUE INDEX "RentalRequestRevisionItem_revision_product_key" ON "RentalRequestRevisionItem"("rentalRequestRevisionId", "productId");
CREATE UNIQUE INDEX "RentalRequestRevisionItem_revision_slug_key" ON "RentalRequestRevisionItem"("rentalRequestRevisionId", "productSlugSnapshot");
CREATE UNIQUE INDEX "RentalRequestRevisionItem_revision_sort_key" ON "RentalRequestRevisionItem"("rentalRequestRevisionId", "sortOrder");
CREATE INDEX "RentalRequestRevisionItem_productId_idx" ON "RentalRequestRevisionItem"("productId");
CREATE UNIQUE INDEX "RentalRequestAmendment_newRevisionId_key" ON "RentalRequestAmendment"("newRevisionId");
CREATE UNIQUE INDEX "RentalRequestAmendment_operationId_key" ON "RentalRequestAmendment"("operationId");
CREATE UNIQUE INDEX "RentalRequestAmendment_request_base_key" ON "RentalRequestAmendment"("rentalRequestId", "baseRevisionId");
CREATE INDEX "RentalRequestAmendment_request_submitted_idx" ON "RentalRequestAmendment"("rentalRequestId", "submittedAt", "id");
CREATE INDEX "RentalRequestAmendment_access_submitted_idx" ON "RentalRequestAmendment"("submittedByCustomerAccessId", "submittedAt", "id");

ALTER TABLE "RentalRequestCustomerAccess" ADD CONSTRAINT "RentalRequestCustomerAccess_request_fkey" FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestRevision" ADD CONSTRAINT "RentalRequestRevision_request_fkey" FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestRevision" ADD CONSTRAINT "RentalRequestRevision_access_fkey" FOREIGN KEY ("submittedByCustomerAccessId") REFERENCES "RentalRequestCustomerAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestRevision" ADD CONSTRAINT "RentalRequestRevision_staff_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestRevisionItem" ADD CONSTRAINT "RentalRequestRevisionItem_revision_fkey" FOREIGN KEY ("rentalRequestRevisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestRevisionItem" ADD CONSTRAINT "RentalRequestRevisionItem_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RentalRequestAmendment" ADD CONSTRAINT "RentalRequestAmendment_request_fkey" FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestAmendment" ADD CONSTRAINT "RentalRequestAmendment_base_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestAmendment" ADD CONSTRAINT "RentalRequestAmendment_new_fkey" FOREIGN KEY ("newRevisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestAmendment" ADD CONSTRAINT "RentalRequestAmendment_access_fkey" FOREIGN KEY ("submittedByCustomerAccessId") REFERENCES "RentalRequestCustomerAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing submitted requests become immutable revision 1 records.
INSERT INTO "RentalRequestCustomerAccess" ("id", "rentalRequestId", "tokenHash", "expiresAt", "createdAt")
SELECT 'phase13_access_' || r."id", r."id", s."tokenHash", s."expiresAt", r."submittedAt"
FROM "RentalRequest" r JOIN "GuestRequestSession" s ON s."id" = r."guestSessionId"
ON CONFLICT ("rentalRequestId", "tokenHash") DO NOTHING;

INSERT INTO "RentalRequestRevision" (
  "id", "rentalRequestId", "revisionNumber", "submittedByType", "contactFirstName", "contactLastName",
  "contactEmail", "contactPhone", "companyName", "projectName", "projectType", "projectLocation",
  "fulfillmentMethod", "deliveryAddress", "rentalStartDate", "rentalEndDate", "requestedTimeZone",
  "customerNotes", "operationId", "payloadHash", "createdAt"
)
SELECT 'phase13_revision_' || r."id", r."id", 1, 'ORIGINAL_SUBMISSION', r."contactFirstName", r."contactLastName",
  r."contactEmail", r."contactPhone", r."companyName", r."projectName", r."projectType", r."projectLocation",
  r."fulfillmentMethod", r."deliveryAddress", r."rentalStartDate", r."rentalEndDate", r."requestedTimeZone",
  r."customerNotes", 'original:' || r."submissionKeyHash", r."submissionPayloadHash", r."submittedAt"
FROM "RentalRequest" r;

INSERT INTO "RentalRequestRevisionItem" (
  "id", "rentalRequestRevisionId", "productId", "productNameSnapshot", "productSlugSnapshot",
  "categoryNameSnapshot", "categorySlugSnapshot", "rentalUnitSnapshot", "primaryImageUrlSnapshot",
  "requestedQuantity", "sortOrder", "createdAt"
)
SELECT 'phase13_revision_item_' || i."id", 'phase13_revision_' || i."rentalRequestId", i."productId",
  i."productName", i."productSlug", i."categoryName", i."categorySlug", i."rentalUnit",
  (SELECT pi."url" FROM "ProductImage" pi WHERE pi."productId" = i."productId" ORDER BY pi."isPrimary" DESC, pi."sortOrder", pi."id" LIMIT 1),
  i."requestedQuantity", row_number() OVER (PARTITION BY i."rentalRequestId" ORDER BY i."createdAt", i."id") - 1, i."createdAt"
FROM "RentalRequestItem" i;

UPDATE "RentalRequest" SET "currentRevisionId" = 'phase13_revision_' || "id";
CREATE UNIQUE INDEX "RentalRequest_currentRevisionId_key" ON "RentalRequest"("currentRevisionId");
ALTER TABLE "RentalRequest" ADD CONSTRAINT "RentalRequest_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Decisions now target one exact immutable revision and may recur across review cycles.
ALTER TABLE "RentalRequestDecision" ADD COLUMN "rentalRequestRevisionId" TEXT;
ALTER TABLE "RentalRequestDecision" ADD COLUMN "supersededAt" TIMESTAMPTZ(3);
ALTER TABLE "RentalRequestDecision" ADD COLUMN "supersededByRevisionId" TEXT;
UPDATE "RentalRequestDecision" SET "rentalRequestRevisionId" = 'phase13_revision_' || "rentalRequestId";
ALTER TABLE "RentalRequestDecision" ALTER COLUMN "rentalRequestRevisionId" SET NOT NULL;
DROP INDEX "RentalRequestDecision_rentalRequestId_key";
CREATE UNIQUE INDEX "RentalRequestDecision_rentalRequestRevisionId_key" ON "RentalRequestDecision"("rentalRequestRevisionId");
CREATE INDEX "RentalRequestDecision_rentalRequestId_decidedAt_id_idx" ON "RentalRequestDecision"("rentalRequestId", "decidedAt", "id");
CREATE INDEX "RentalRequestDecision_supersededByRevisionId_idx" ON "RentalRequestDecision"("supersededByRevisionId");
ALTER TABLE "RentalRequestDecision" ADD CONSTRAINT "RentalRequestDecision_revision_fkey" FOREIGN KEY ("rentalRequestRevisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestDecision" ADD CONSTRAINT "RentalRequestDecision_superseded_revision_fkey" FOREIGN KEY ("supersededByRevisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalRequestDecisionItem" ADD COLUMN "rentalRequestRevisionItemId" TEXT;
UPDATE "RentalRequestDecisionItem" di SET "rentalRequestRevisionItemId" = 'phase13_revision_item_' || di."rentalRequestItemId";
ALTER TABLE "RentalRequestDecisionItem" ALTER COLUMN "rentalRequestRevisionItemId" SET NOT NULL;
ALTER TABLE "RentalRequestDecisionItem" DROP CONSTRAINT "RentalRequestDecisionItem_rentalRequestItemId_fkey";
DROP INDEX "RentalRequestDecisionItem_rentalRequestItemId_key";
DROP INDEX "RentalRequestDecisionItem_decisionId_rentalRequestItemId_key";
ALTER TABLE "RentalRequestDecisionItem" DROP COLUMN "rentalRequestItemId";
CREATE UNIQUE INDEX "RentalRequestDecisionItem_revisionItemId_key" ON "RentalRequestDecisionItem"("rentalRequestRevisionItemId");
CREATE UNIQUE INDEX "RentalRequestDecisionItem_decision_revisionItem_key" ON "RentalRequestDecisionItem"("decisionId", "rentalRequestRevisionItemId");
ALTER TABLE "RentalRequestDecisionItem" ADD CONSTRAINT "RentalRequestDecisionItem_revisionItem_fkey" FOREIGN KEY ("rentalRequestRevisionItemId") REFERENCES "RentalRequestRevisionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalRequestActivity" DROP CONSTRAINT "RentalRequestActivity_shape_check";
ALTER TABLE "RentalRequestActivity" ADD CONSTRAINT "RentalRequestActivity_revision_fkey" FOREIGN KEY ("revisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RentalRequestActivity_revisionId_createdAt_id_idx" ON "RentalRequestActivity"("revisionId", "createdAt", "id");

CREATE TABLE "RentalChangeRequest" (
  "id" TEXT NOT NULL, "rentalRequestId" TEXT NOT NULL, "sourceRevisionId" TEXT NOT NULL,
  "quoteId" TEXT, "acceptedQuoteRevisionId" TEXT, "rentalOrderId" TEXT,
  "submittedByCustomerAccessId" TEXT NOT NULL, "status" "RentalChangeRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "reason" TEXT NOT NULL, "contactFirstName" TEXT NOT NULL, "contactLastName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL, "contactPhone" TEXT NOT NULL, "companyName" TEXT,
  "projectName" TEXT NOT NULL, "projectType" TEXT NOT NULL, "projectLocation" TEXT NOT NULL,
  "fulfillmentMethod" "RentalRequestFulfillmentMethod" NOT NULL, "deliveryAddress" TEXT,
  "rentalStartDate" DATE NOT NULL, "rentalEndDate" DATE NOT NULL, "requestedTimeZone" TEXT NOT NULL,
  "customerNotes" TEXT, "operationId" TEXT NOT NULL, "payloadHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMPTZ(3),
  "reviewedByUserId" TEXT, "reviewNote" TEXT, "reviewVersion" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RentalChangeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalChangeRequest_source_check" CHECK (("quoteId" IS NOT NULL AND "acceptedQuoteRevisionId" IS NOT NULL) OR "rentalOrderId" IS NOT NULL),
  CONSTRAINT "RentalChangeRequest_dates_check" CHECK ("rentalEndDate" >= "rentalStartDate"),
  CONSTRAINT "RentalChangeRequest_review_check" CHECK (("status" IN ('SUBMITTED','UNDER_REVIEW') AND "reviewedAt" IS NULL AND "reviewedByUserId" IS NULL) OR ("status" NOT IN ('SUBMITTED','UNDER_REVIEW') AND "reviewedAt" IS NOT NULL AND "reviewedByUserId" IS NOT NULL))
);

CREATE TABLE "RentalChangeRequestItem" (
  "id" TEXT NOT NULL, "rentalChangeRequestId" TEXT NOT NULL, "productId" TEXT,
  "changeType" "RentalChangeRequestItemType" NOT NULL, "productNameSnapshot" TEXT NOT NULL,
  "productSlugSnapshot" TEXT NOT NULL, "categoryNameSnapshot" TEXT NOT NULL, "categorySlugSnapshot" TEXT NOT NULL,
  "rentalUnitSnapshot" TEXT NOT NULL, "primaryImageUrlSnapshot" TEXT, "previousQuantity" INTEGER,
  "proposedQuantity" INTEGER, "sortOrder" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalChangeRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalChangeRequestItem_quantities_check" CHECK (
    ("changeType" = 'ADDED' AND "previousQuantity" IS NULL AND "proposedQuantity" > 0)
    OR ("changeType" = 'REMOVED' AND "previousQuantity" > 0 AND "proposedQuantity" IS NULL)
    OR ("changeType" IN ('QUANTITY_CHANGED','UNCHANGED') AND "previousQuantity" > 0 AND "proposedQuantity" > 0)
  ),
  CONSTRAINT "RentalChangeRequestItem_sort_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "RentalChangeRequest_operationId_key" ON "RentalChangeRequest"("operationId");
CREATE INDEX "RentalChangeRequest_status_createdAt_id_idx" ON "RentalChangeRequest"("status", "createdAt", "id");
CREATE INDEX "RentalChangeRequest_request_createdAt_id_idx" ON "RentalChangeRequest"("rentalRequestId", "createdAt", "id");
CREATE INDEX "RentalChangeRequest_quote_createdAt_id_idx" ON "RentalChangeRequest"("quoteId", "createdAt", "id");
CREATE INDEX "RentalChangeRequest_order_createdAt_id_idx" ON "RentalChangeRequest"("rentalOrderId", "createdAt", "id");
CREATE INDEX "RentalChangeRequest_access_createdAt_id_idx" ON "RentalChangeRequest"("submittedByCustomerAccessId", "createdAt", "id");
CREATE INDEX "RentalChangeRequest_reviewer_reviewedAt_id_idx" ON "RentalChangeRequest"("reviewedByUserId", "reviewedAt", "id");
CREATE UNIQUE INDEX "RentalChangeRequestItem_request_product_key" ON "RentalChangeRequestItem"("rentalChangeRequestId", "productId");
CREATE UNIQUE INDEX "RentalChangeRequestItem_request_slug_key" ON "RentalChangeRequestItem"("rentalChangeRequestId", "productSlugSnapshot");
CREATE UNIQUE INDEX "RentalChangeRequestItem_request_sort_key" ON "RentalChangeRequestItem"("rentalChangeRequestId", "sortOrder");
CREATE INDEX "RentalChangeRequestItem_productId_idx" ON "RentalChangeRequestItem"("productId");

ALTER TABLE "RentalChangeRequest" ADD CONSTRAINT "RentalChangeRequest_request_fkey" FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequest" ADD CONSTRAINT "RentalChangeRequest_source_revision_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "RentalRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequest" ADD CONSTRAINT "RentalChangeRequest_quote_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequest" ADD CONSTRAINT "RentalChangeRequest_accepted_revision_fkey" FOREIGN KEY ("acceptedQuoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequest" ADD CONSTRAINT "RentalChangeRequest_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequest" ADD CONSTRAINT "RentalChangeRequest_access_fkey" FOREIGN KEY ("submittedByCustomerAccessId") REFERENCES "RentalRequestCustomerAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequest" ADD CONSTRAINT "RentalChangeRequest_reviewer_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequestItem" ADD CONSTRAINT "RentalChangeRequestItem_request_fkey" FOREIGN KEY ("rentalChangeRequestId") REFERENCES "RentalChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalChangeRequestItem" ADD CONSTRAINT "RentalChangeRequestItem_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Request state transitions now explicitly permit amendment re-review cycles.
CREATE FUNCTION enforce_rental_request_status_transition() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS NOT DISTINCT FROM NEW."status" THEN RETURN NEW; END IF;
  IF (OLD."status" = 'SUBMITTED' AND NEW."status" = 'UNDER_REVIEW')
    OR (OLD."status" IN ('SUBMITTED','UNDER_REVIEW','APPROVED','PARTIALLY_APPROVED','REJECTED') AND NEW."status" = 'RE_REVIEW_REQUIRED')
    OR (OLD."status" = 'RE_REVIEW_REQUIRED' AND NEW."status" = 'UNDER_REVIEW')
    OR (OLD."status" = 'UNDER_REVIEW' AND NEW."status" IN ('APPROVED','PARTIALLY_APPROVED','REJECTED'))
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid rental request status transition';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequest_status_transition" BEFORE UPDATE OF "status" ON "RentalRequest" FOR EACH ROW EXECUTE FUNCTION enforce_rental_request_status_transition();

CREATE FUNCTION validate_rental_request_current_revision() RETURNS trigger AS $$
DECLARE owner_id TEXT;
BEGIN
  IF NEW."currentRevisionId" IS NULL THEN RAISE EXCEPTION 'Rental request requires a current revision'; END IF;
  SELECT "rentalRequestId" INTO owner_id FROM "RentalRequestRevision" WHERE "id" = NEW."currentRevisionId";
  IF owner_id IS DISTINCT FROM NEW."id" THEN RAISE EXCEPTION 'Current revision must belong to the rental request'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "RentalRequest_current_revision_consistency" AFTER INSERT OR UPDATE OF "currentRevisionId" ON "RentalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_request_current_revision();

CREATE FUNCTION protect_rental_request_revision_history() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Rental request revision history is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequestRevision_immutable" BEFORE UPDATE OR DELETE ON "RentalRequestRevision" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_revision_history();
CREATE TRIGGER "RentalRequestRevisionItem_immutable" BEFORE UPDATE OR DELETE ON "RentalRequestRevisionItem" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_revision_history();
CREATE TRIGGER "RentalRequestAmendment_immutable" BEFORE UPDATE OR DELETE ON "RentalRequestAmendment" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_revision_history();
CREATE TRIGGER "RentalChangeRequestItem_immutable" BEFORE UPDATE OR DELETE ON "RentalChangeRequestItem" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_revision_history();

CREATE FUNCTION validate_rental_request_revision_links() RETURNS trigger AS $$
DECLARE base_owner TEXT; new_owner TEXT; access_owner TEXT; base_number INTEGER; new_number INTEGER;
BEGIN
  SELECT "rentalRequestId", "revisionNumber" INTO base_owner, base_number FROM "RentalRequestRevision" WHERE "id"=NEW."baseRevisionId";
  SELECT "rentalRequestId", "revisionNumber" INTO new_owner, new_number FROM "RentalRequestRevision" WHERE "id"=NEW."newRevisionId";
  SELECT "rentalRequestId" INTO access_owner FROM "RentalRequestCustomerAccess" WHERE "id"=NEW."submittedByCustomerAccessId";
  IF base_owner IS DISTINCT FROM NEW."rentalRequestId" OR new_owner IS DISTINCT FROM NEW."rentalRequestId" OR access_owner IS DISTINCT FROM NEW."rentalRequestId" OR new_number <> base_number + 1 THEN
    RAISE EXCEPTION 'Amendment references must belong to one request and advance one revision';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequestAmendment_links" BEFORE INSERT ON "RentalRequestAmendment" FOR EACH ROW EXECUTE FUNCTION validate_rental_request_revision_links();

CREATE OR REPLACE FUNCTION protect_rental_request_decision_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Rental request decisions are append-only'; END IF;
  IF OLD."supersededAt" IS NULL AND NEW."supersededAt" IS NOT NULL AND NEW."supersededByRevisionId" IS NOT NULL
    AND OLD."id" IS NOT DISTINCT FROM NEW."id" AND OLD."rentalRequestId" IS NOT DISTINCT FROM NEW."rentalRequestId"
    AND OLD."rentalRequestRevisionId" IS NOT DISTINCT FROM NEW."rentalRequestRevisionId" AND OLD."outcome" IS NOT DISTINCT FROM NEW."outcome"
    AND OLD."decidedByUserId" IS NOT DISTINCT FROM NEW."decidedByUserId" AND OLD."operationId" IS NOT DISTINCT FROM NEW."operationId"
    AND OLD."payloadHash" IS NOT DISTINCT FROM NEW."payloadHash" AND OLD."internalReason" IS NOT DISTINCT FROM NEW."internalReason"
    AND OLD."customerExplanation" IS NOT DISTINCT FROM NEW."customerExplanation" AND OLD."reviewVersionBefore" IS NOT DISTINCT FROM NEW."reviewVersionBefore"
    AND OLD."reviewVersionAfter" IS NOT DISTINCT FROM NEW."reviewVersionAfter" AND OLD."decidedAt" IS NOT DISTINCT FROM NEW."decidedAt"
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Rental request decisions are append-only except one-way supersession';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequestDecision_immutable_update" BEFORE UPDATE ON "RentalRequestDecision" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_decision_history();
CREATE TRIGGER "RentalRequestDecisionItem_immutable_update" BEFORE UPDATE ON "RentalRequestDecisionItem" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_decision_history();

CREATE FUNCTION validate_rental_request_decision_item() RETURNS trigger AS $$
DECLARE decision_revision TEXT; item_revision TEXT; item_quantity INTEGER;
BEGIN
  SELECT "rentalRequestRevisionId" INTO decision_revision FROM "RentalRequestDecision" WHERE "id"=NEW."decisionId";
  SELECT "rentalRequestRevisionId", "requestedQuantity" INTO item_revision, item_quantity FROM "RentalRequestRevisionItem" WHERE "id"=NEW."rentalRequestRevisionItemId";
  IF decision_revision IS NULL OR item_revision IS NULL OR decision_revision <> item_revision THEN RAISE EXCEPTION 'Decision items must belong to the decided revision'; END IF;
  IF NEW."requestedQuantitySnapshot" <> item_quantity THEN RAISE EXCEPTION 'Decision quantity snapshot must match the request revision'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequestDecisionItem_validate_insert" BEFORE INSERT ON "RentalRequestDecisionItem" FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_item();

CREATE FUNCTION validate_rental_request_decision_consistency() RETURNS trigger AS $$
DECLARE request_id TEXT; current_revision TEXT; request_status TEXT; request_version INTEGER; decision_id TEXT; decision_outcome TEXT; decision_version INTEGER; revision_item_count INTEGER; decision_item_count INTEGER; invalid_count INTEGER;
BEGIN
  IF TG_TABLE_NAME='RentalRequest' THEN request_id:=NEW."id";
  ELSIF TG_TABLE_NAME='RentalRequestDecision' THEN request_id:=NEW."rentalRequestId";
  ELSE SELECT d."rentalRequestId" INTO request_id FROM "RentalRequestDecision" d WHERE d."id"=NEW."decisionId"; END IF;
  SELECT r."currentRevisionId", r."status"::TEXT, r."reviewVersion" INTO current_revision, request_status, request_version FROM "RentalRequest" r WHERE r."id"=request_id;
  SELECT d."id", d."outcome"::TEXT, d."reviewVersionAfter" INTO decision_id, decision_outcome, decision_version FROM "RentalRequestDecision" d WHERE d."rentalRequestRevisionId"=current_revision AND d."supersededAt" IS NULL;
  IF request_status IN ('SUBMITTED','RE_REVIEW_REQUIRED','UNDER_REVIEW') THEN
    IF decision_id IS NOT NULL THEN RAISE EXCEPTION 'A request awaiting review cannot have a current decision'; END IF; RETURN NULL;
  END IF;
  IF decision_id IS NULL OR decision_outcome IS DISTINCT FROM request_status OR decision_version IS DISTINCT FROM request_version THEN RAISE EXCEPTION 'Terminal request status must match its current revision decision'; END IF;
  SELECT count(*) INTO revision_item_count FROM "RentalRequestRevisionItem" WHERE "rentalRequestRevisionId"=current_revision;
  SELECT count(*) INTO decision_item_count FROM "RentalRequestDecisionItem" WHERE "decisionId"=decision_id;
  IF revision_item_count=0 OR decision_item_count<>revision_item_count THEN RAISE EXCEPTION 'Every revision item requires one decision item'; END IF;
  SELECT count(*) INTO invalid_count FROM "RentalRequestDecisionItem" WHERE "decisionId"=decision_id AND ((decision_outcome='APPROVED' AND "approvedQuantity"<>"requestedQuantitySnapshot") OR (decision_outcome='REJECTED' AND "approvedQuantity"<>0));
  IF invalid_count>0 THEN RAISE EXCEPTION 'Decision quantities do not match outcome'; END IF;
  IF decision_outcome='PARTIALLY_APPROVED' AND (NOT EXISTS(SELECT 1 FROM "RentalRequestDecisionItem" WHERE "decisionId"=decision_id AND "approvedQuantity"<>"requestedQuantitySnapshot") OR NOT EXISTS(SELECT 1 FROM "RentalRequestDecisionItem" WHERE "decisionId"=decision_id AND "approvedQuantity">0)) THEN RAISE EXCEPTION 'Partial approval requires a changed and positive line'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "RentalRequest_decision_consistency" AFTER INSERT OR UPDATE ON "RentalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_consistency();
CREATE CONSTRAINT TRIGGER "RentalRequestDecision_consistency" AFTER INSERT OR UPDATE OF "supersededAt", "supersededByRevisionId" ON "RentalRequestDecision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_consistency();
CREATE CONSTRAINT TRIGGER "RentalRequestDecisionItem_consistency" AFTER INSERT ON "RentalRequestDecisionItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_consistency();

-- Quote sources must be the non-superseded decision for the request's current revision.
CREATE FUNCTION validate_quote_revision_source() RETURNS trigger AS $$
DECLARE quote_request TEXT; decision_request TEXT; decision_revision TEXT; current_revision TEXT; decision_outcome TEXT; superseded_at TIMESTAMPTZ;
BEGIN
  SELECT "rentalRequestId" INTO quote_request FROM "Quote" WHERE "id"=NEW."quoteId";
  SELECT "rentalRequestId", "rentalRequestRevisionId", "outcome"::TEXT, "supersededAt" INTO decision_request, decision_revision, decision_outcome, superseded_at FROM "RentalRequestDecision" WHERE "id"=NEW."rentalRequestDecisionId";
  SELECT "currentRevisionId" INTO current_revision FROM "RentalRequest" WHERE "id"=quote_request;
  IF quote_request IS NULL OR decision_request IS NULL OR quote_request<>decision_request OR decision_revision<>current_revision OR superseded_at IS NOT NULL OR decision_outcome NOT IN ('APPROVED','PARTIALLY_APPROVED') THEN RAISE EXCEPTION 'Quote revision must reference the eligible current decision'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteRevision_source" BEFORE INSERT ON "QuoteRevision" FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_source();

CREATE FUNCTION validate_quote_item_source() RETURNS trigger AS $$
DECLARE revision_decision TEXT; item_decision TEXT; approved INTEGER; p_id TEXT; p_name TEXT; p_slug TEXT; c_name TEXT; c_slug TEXT; unit_name TEXT;
BEGIN
  SELECT "rentalRequestDecisionId" INTO revision_decision FROM "QuoteRevision" WHERE "id"=NEW."quoteRevisionId";
  SELECT di."decisionId", di."approvedQuantity", ri."productId", ri."productNameSnapshot", ri."productSlugSnapshot", ri."categoryNameSnapshot", ri."categorySlugSnapshot", ri."rentalUnitSnapshot"
  INTO item_decision, approved, p_id, p_name, p_slug, c_name, c_slug, unit_name
  FROM "RentalRequestDecisionItem" di JOIN "RentalRequestRevisionItem" ri ON ri."id"=di."rentalRequestRevisionItemId" WHERE di."id"=NEW."rentalRequestDecisionItemId";
  IF revision_decision IS NULL OR item_decision IS NULL OR revision_decision<>item_decision OR approved<=0 OR NEW."approvedQuantitySnapshot"<>approved OR NEW."productIdSnapshot"<>p_id OR NEW."productNameSnapshot"<>p_name OR NEW."productSlugSnapshot"<>p_slug OR NEW."categoryNameSnapshot"<>c_name OR NEW."categorySlugSnapshot"<>c_slug OR NEW."rentalUnitSnapshot"<>unit_name OR NEW."quotedQuantity"<=0 OR NEW."quotedQuantity">approved THEN RAISE EXCEPTION 'Quote item must match an approved decision item snapshot'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteRevisionItem_source" BEFORE INSERT ON "QuoteRevisionItem" FOR EACH ROW EXECUTE FUNCTION validate_quote_item_source();

CREATE FUNCTION protect_change_request_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Rental change requests are append-only'; END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id" OR OLD."rentalRequestId" IS DISTINCT FROM NEW."rentalRequestId" OR OLD."sourceRevisionId" IS DISTINCT FROM NEW."sourceRevisionId" OR OLD."quoteId" IS DISTINCT FROM NEW."quoteId" OR OLD."acceptedQuoteRevisionId" IS DISTINCT FROM NEW."acceptedQuoteRevisionId" OR OLD."rentalOrderId" IS DISTINCT FROM NEW."rentalOrderId" OR OLD."submittedByCustomerAccessId" IS DISTINCT FROM NEW."submittedByCustomerAccessId" OR OLD."reason" IS DISTINCT FROM NEW."reason" OR OLD."operationId" IS DISTINCT FROM NEW."operationId" OR OLD."payloadHash" IS DISTINCT FROM NEW."payloadHash" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR NEW."reviewVersion"<>OLD."reviewVersion"+1 THEN RAISE EXCEPTION 'Only change-request review state may change'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalChangeRequest_protect" BEFORE UPDATE OR DELETE ON "RentalChangeRequest" FOR EACH ROW EXECUTE FUNCTION protect_change_request_history();

CREATE FUNCTION validate_change_request_links() RETURNS trigger AS $$
DECLARE revision_request TEXT; access_request TEXT; quote_request TEXT; accepted_quote TEXT; order_request TEXT;
BEGIN
  SELECT "rentalRequestId" INTO revision_request FROM "RentalRequestRevision" WHERE "id"=NEW."sourceRevisionId";
  SELECT "rentalRequestId" INTO access_request FROM "RentalRequestCustomerAccess" WHERE "id"=NEW."submittedByCustomerAccessId";
  IF NEW."quoteId" IS NOT NULL THEN SELECT "rentalRequestId" INTO quote_request FROM "Quote" WHERE "id"=NEW."quoteId"; END IF;
  IF NEW."acceptedQuoteRevisionId" IS NOT NULL THEN SELECT "quoteId" INTO accepted_quote FROM "QuoteRevision" WHERE "id"=NEW."acceptedQuoteRevisionId"; END IF;
  IF NEW."rentalOrderId" IS NOT NULL THEN SELECT "rentalRequestId" INTO order_request FROM "RentalOrder" WHERE "id"=NEW."rentalOrderId"; END IF;
  IF revision_request IS DISTINCT FROM NEW."rentalRequestId" OR access_request IS DISTINCT FROM NEW."rentalRequestId" OR (NEW."quoteId" IS NOT NULL AND (quote_request IS DISTINCT FROM NEW."rentalRequestId" OR accepted_quote IS DISTINCT FROM NEW."quoteId")) OR (NEW."rentalOrderId" IS NOT NULL AND order_request IS DISTINCT FROM NEW."rentalRequestId") THEN RAISE EXCEPTION 'Change-request sources must belong to the same rental request'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalChangeRequest_links" BEFORE INSERT ON "RentalChangeRequest" FOR EACH ROW EXECUTE FUNCTION validate_change_request_links();
