CREATE TYPE "QuoteDiscountType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');

ALTER TYPE "QuoteActivityType" ADD VALUE 'QUOTE_DRAFT_UPDATED';
ALTER TYPE "QuoteActivityType" ADD VALUE 'QUOTE_RESENT';
ALTER TYPE "QuoteActivityType" ADD VALUE 'QUOTE_ACCESS_ROTATED';
ALTER TYPE "RentalOrderActivityType" ADD VALUE 'ORDER_CUSTOMER_ACCESS_REVOKED';
ALTER TYPE "RentalOrderActivityType" ADD VALUE 'ORDER_CUSTOMER_ACCESS_ROTATED';
ALTER TYPE "RentalOrderActivityType" ADD VALUE 'ORDER_CUSTOMER_ACCESS_RESENT';

ALTER TABLE "QuoteRevision"
  ADD COLUMN "discountType" "QuoteDiscountType" NOT NULL DEFAULT 'FIXED_AMOUNT',
  ADD COLUMN "discountRateBasisPoints" INTEGER,
  ADD COLUMN "discountBaseCents" BIGINT,
  ADD COLUMN "taxableDiscountCents" BIGINT,
  ADD COLUMN "contactFirstNameSnapshot" TEXT,
  ADD COLUMN "contactLastNameSnapshot" TEXT,
  ADD COLUMN "companyNameSnapshot" TEXT,
  ADD COLUMN "projectNameSnapshot" TEXT,
  ADD COLUMN "projectTypeSnapshot" TEXT,
  ADD COLUMN "projectLocationSnapshot" TEXT,
  ADD COLUMN "fulfillmentMethodSnapshot" "RentalRequestFulfillmentMethod",
  ADD COLUMN "deliveryAddressSnapshot" TEXT,
  ADD COLUMN "rentalStartDateSnapshot" DATE,
  ADD COLUMN "rentalEndDateSnapshot" DATE,
  ADD COLUMN "requestedTimeZoneSnapshot" TEXT,
  ADD COLUMN "draftVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "QuoteRevision" DISABLE TRIGGER "QuoteRevision_immutable";
UPDATE "QuoteRevision" revision
SET
  "discountBaseCents" = revision."subtotalCents",
  "taxableDiscountCents" = CASE WHEN revision."discountTaxable" THEN revision."discountCents" ELSE 0 END,
  "contactFirstNameSnapshot" = request."contactFirstName",
  "contactLastNameSnapshot" = request."contactLastName",
  "companyNameSnapshot" = request."companyName",
  "projectNameSnapshot" = request."projectName",
  "projectTypeSnapshot" = request."projectType",
  "projectLocationSnapshot" = request."projectLocation",
  "fulfillmentMethodSnapshot" = request."fulfillmentMethod",
  "deliveryAddressSnapshot" = request."deliveryAddress",
  "rentalStartDateSnapshot" = request."rentalStartDate",
  "rentalEndDateSnapshot" = request."rentalEndDate",
  "requestedTimeZoneSnapshot" = request."requestedTimeZone"
FROM "Quote" quote
JOIN "RentalRequest" request ON request."id" = quote."rentalRequestId"
WHERE revision."quoteId" = quote."id";
ALTER TABLE "QuoteRevision" ENABLE TRIGGER "QuoteRevision_immutable";

ALTER TABLE "QuoteRevision"
  ALTER COLUMN "discountBaseCents" SET NOT NULL,
  ALTER COLUMN "taxableDiscountCents" SET NOT NULL,
  ALTER COLUMN "contactFirstNameSnapshot" SET NOT NULL,
  ALTER COLUMN "contactLastNameSnapshot" SET NOT NULL,
  ALTER COLUMN "projectNameSnapshot" SET NOT NULL,
  ALTER COLUMN "projectTypeSnapshot" SET NOT NULL,
  ALTER COLUMN "projectLocationSnapshot" SET NOT NULL,
  ALTER COLUMN "fulfillmentMethodSnapshot" SET NOT NULL,
  ALTER COLUMN "rentalStartDateSnapshot" SET NOT NULL,
  ALTER COLUMN "rentalEndDateSnapshot" SET NOT NULL,
  ALTER COLUMN "requestedTimeZoneSnapshot" SET NOT NULL;

ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_discount_snapshot_check" CHECK (
  "discountBaseCents" BETWEEN 0 AND 100000000000000 AND
  "taxableDiscountCents" BETWEEN 0 AND "discountCents" AND
  "draftVersion" >= 0 AND
  (("discountType" = 'FIXED_AMOUNT' AND "discountRateBasisPoints" IS NULL) OR
   ("discountType" = 'PERCENTAGE' AND "discountRateBasisPoints" BETWEEN 0 AND 10000))
);

ALTER TABLE "QuoteRevision" DROP CONSTRAINT "QuoteRevision_bounds_check";
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_bounds_check" CHECK (
  "revisionNumber" > 0 AND "currency" = 'CAD' AND
  "itemSubtotalCents" BETWEEN 0 AND 100000000000000 AND
  "chargeTotalCents" BETWEEN 0 AND 100000000000000 AND
  "subtotalCents" BETWEEN 0 AND 100000000000000 AND
  "discountCents" BETWEEN 0 AND 100000000000000 AND
  "taxableSubtotalCents" BETWEEN 0 AND 100000000000000 AND
  "taxCents" BETWEEN 0 AND 100000000000000 AND
  "totalCents" BETWEEN 0 AND 100000000000000
);

ALTER TABLE "RentalOrder"
  ADD COLUMN "discountType" "QuoteDiscountType" NOT NULL DEFAULT 'FIXED_AMOUNT',
  ADD COLUMN "discountRateBasisPoints" INTEGER,
  ADD COLUMN "discountBaseCents" BIGINT,
  ADD COLUMN "taxableDiscountCents" BIGINT;

ALTER TABLE "RentalOrder" DISABLE TRIGGER "RentalOrder_immutable";
UPDATE "RentalOrder"
SET "discountBaseCents" = "subtotalCents",
    "taxableDiscountCents" = CASE WHEN "discountTaxable" THEN "discountCents" ELSE 0 END;
ALTER TABLE "RentalOrder" ENABLE TRIGGER "RentalOrder_immutable";

ALTER TABLE "RentalOrder"
  ALTER COLUMN "discountBaseCents" SET NOT NULL,
  ALTER COLUMN "taxableDiscountCents" SET NOT NULL;

ALTER TABLE "RentalOrder" ADD CONSTRAINT "RentalOrder_discount_snapshot_check" CHECK (
  "discountBaseCents" BETWEEN 0 AND 100000000000000 AND
  "taxableDiscountCents" BETWEEN 0 AND "discountCents" AND
  (("discountType" = 'FIXED_AMOUNT' AND "discountRateBasisPoints" IS NULL) OR
   ("discountType" = 'PERCENTAGE' AND "discountRateBasisPoints" BETWEEN 0 AND 10000))
);

DROP INDEX "QuoteCustomerAccess_quoteRevisionId_key";
ALTER TABLE "QuoteCustomerAccess"
  ADD COLUMN "operationId" UUID,
  ADD COLUMN "payloadHash" CHAR(64),
  ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "QuoteCustomerAccess" DISABLE TRIGGER "QuoteCustomerAccess_protect";
UPDATE "QuoteCustomerAccess" access
SET "operationId" = access."id",
    "payloadHash" = access."tokenHash",
    "createdByUserId" = quote."createdByUserId"
FROM "QuoteRevision" revision
JOIN "Quote" quote ON quote."id" = revision."quoteId"
WHERE access."quoteRevisionId" = revision."id";
ALTER TABLE "QuoteCustomerAccess" ENABLE TRIGGER "QuoteCustomerAccess_protect";
ALTER TABLE "QuoteCustomerAccess"
  ALTER COLUMN "operationId" SET NOT NULL,
  ALTER COLUMN "payloadHash" SET NOT NULL,
  ALTER COLUMN "createdByUserId" SET NOT NULL;
CREATE UNIQUE INDEX "QuoteCustomerAccess_operationId_key" ON "QuoteCustomerAccess"("operationId");
CREATE INDEX "QuoteCustomerAccess_quoteRevisionId_createdAt_id_idx" ON "QuoteCustomerAccess"("quoteRevisionId", "createdAt", "id");
CREATE INDEX "QuoteCustomerAccess_createdByUserId_createdAt_id_idx" ON "QuoteCustomerAccess"("createdByUserId", "createdAt", "id");
CREATE UNIQUE INDEX "QuoteCustomerAccess_one_active_idx" ON "QuoteCustomerAccess"("quoteRevisionId") WHERE "revokedAt" IS NULL;
ALTER TABLE "QuoteCustomerAccess" ADD CONSTRAINT "QuoteCustomerAccess_operation_payload_check" CHECK (
  "payloadHash" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "QuoteCustomerAccess" ADD CONSTRAINT "QuoteCustomerAccess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderCustomerAccess" DROP CONSTRAINT "OrderCustomerAccess_rentalOrderId_key";
ALTER TABLE "OrderCustomerAccess"
  ADD COLUMN "operationId" UUID,
  ADD COLUMN "payloadHash" CHAR(64),
  ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "OrderCustomerAccess" DISABLE TRIGGER "OrderCustomerAccess_protect";
UPDATE "OrderCustomerAccess" access
SET "operationId" = access."id",
    "payloadHash" = access."tokenHash",
    "createdByUserId" = orders."confirmedByUserId"
FROM "RentalOrder" orders
WHERE access."rentalOrderId" = orders."id";
ALTER TABLE "OrderCustomerAccess" ENABLE TRIGGER "OrderCustomerAccess_protect";
ALTER TABLE "OrderCustomerAccess"
  ALTER COLUMN "operationId" SET NOT NULL,
  ALTER COLUMN "payloadHash" SET NOT NULL,
  ALTER COLUMN "createdByUserId" SET NOT NULL;
CREATE UNIQUE INDEX "OrderCustomerAccess_operationId_key" ON "OrderCustomerAccess"("operationId");
CREATE INDEX "OrderCustomerAccess_rentalOrderId_createdAt_id_idx" ON "OrderCustomerAccess"("rentalOrderId", "createdAt", "id");
CREATE INDEX "OrderCustomerAccess_createdByUserId_createdAt_id_idx" ON "OrderCustomerAccess"("createdByUserId", "createdAt", "id");
CREATE UNIQUE INDEX "OrderCustomerAccess_one_active_idx" ON "OrderCustomerAccess"("rentalOrderId") WHERE "revokedAt" IS NULL;
ALTER TABLE "OrderCustomerAccess" ADD CONSTRAINT "OrderCustomerAccess_operation_payload_check" CHECK (
  "payloadHash" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "OrderCustomerAccess" ADD CONSTRAINT "OrderCustomerAccess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalOrderActivity"
  ADD COLUMN "operationId" UUID,
  ADD COLUMN "payloadHash" CHAR(64);
CREATE UNIQUE INDEX "RentalOrderActivity_operationId_key" ON "RentalOrderActivity"("operationId");
ALTER TABLE "RentalOrderActivity" ADD CONSTRAINT "RentalOrderActivity_payload_hash_check" CHECK (
  "payloadHash" IS NULL OR "payloadHash" ~ '^[0-9a-f]{64}$'
);

CREATE OR REPLACE FUNCTION protect_quote_append_only() RETURNS trigger AS $$
DECLARE revision_id TEXT; revision_state TEXT;
BEGIN
  IF TG_TABLE_NAME = 'QuoteRevision' THEN
    revision_id := COALESCE(NEW."id", OLD."id");
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Quote revisions cannot be deleted'; END IF;
  ELSIF TG_TABLE_NAME IN ('QuoteRevisionItem', 'QuoteRevisionCharge', 'QuoteRevisionTax') THEN
    revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."quoteRevisionId" ELSE NEW."quoteRevisionId" END;
  ELSE
    RAISE EXCEPTION 'Quote commercial history is append-only';
  END IF;
  SELECT "state"::TEXT INTO revision_state FROM "QuoteRevisionLifecycle" WHERE "quoteRevisionId" = revision_id FOR UPDATE;
  IF revision_state IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Only an unsent draft quote may be edited';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_quote_access() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' OR
     OLD."quoteRevisionId" IS DISTINCT FROM NEW."quoteRevisionId" OR
     OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash" OR
     OLD."operationId" IS DISTINCT FROM NEW."operationId" OR
     OLD."payloadHash" IS DISTINCT FROM NEW."payloadHash" OR
     OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId" OR
     OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR
     OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
     (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION 'Quote customer access cannot be changed except for one-way revocation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_order_customer_access() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' OR
     OLD."rentalOrderId" IS DISTINCT FROM NEW."rentalOrderId" OR
     OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash" OR
     OLD."operationId" IS DISTINCT FROM NEW."operationId" OR
     OLD."payloadHash" IS DISTINCT FROM NEW."payloadHash" OR
     OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId" OR
     OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR
     OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
     (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") OR
     (OLD."firstViewedAt" IS NOT NULL AND NEW."firstViewedAt" IS DISTINCT FROM OLD."firstViewedAt") THEN
    RAISE EXCEPTION 'Order customer access can only be revoked or marked viewed once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "QuoteRevision_totals" ON "QuoteRevision";
DROP TRIGGER "QuoteRevisionItem_totals" ON "QuoteRevisionItem";
DROP TRIGGER "QuoteRevisionCharge_totals" ON "QuoteRevisionCharge";
DROP TRIGGER "QuoteRevisionTax_totals" ON "QuoteRevisionTax";

CREATE OR REPLACE FUNCTION validate_quote_revision_totals() RETURNS trigger AS $$
DECLARE rid TEXT; positive_count INTEGER; quoted_count INTEGER; items_total BIGINT; charges_total BIGINT; taxable_gross BIGINT; discount_value BIGINT; discount_type_value TEXT; discount_rate INTEGER; discount_base BIGINT; taxable_discount BIGINT; expected_discount BIGINT; expected_taxable_discount BIGINT; expected_taxable BIGINT; rate_value INTEGER; stored_taxable BIGINT; stored_tax BIGINT; expected_tax BIGINT; stored_item BIGINT; stored_charge BIGINT; stored_subtotal BIGINT; stored_total BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'QuoteRevision' THEN rid := COALESCE(NEW."id", OLD."id"); ELSE rid := CASE WHEN TG_OP='DELETE' THEN OLD."quoteRevisionId" ELSE NEW."quoteRevisionId" END; END IF;
  SELECT count(*) INTO positive_count FROM "RentalRequestDecisionItem" di JOIN "QuoteRevision" r ON r."rentalRequestDecisionId"=di."decisionId" WHERE r."id"=rid AND di."approvedQuantity">0;
  SELECT count(*), COALESCE(sum("lineSubtotalCents"),0), COALESCE(sum(CASE WHEN "taxable" THEN "lineSubtotalCents" ELSE 0 END),0) INTO quoted_count, items_total, taxable_gross FROM "QuoteRevisionItem" WHERE "quoteRevisionId"=rid;
  IF positive_count = 0 OR quoted_count <> positive_count THEN RAISE EXCEPTION 'Every positive approved item must appear exactly once'; END IF;
  SELECT COALESCE(sum("amountCents"),0), taxable_gross + COALESCE(sum(CASE WHEN "taxable" THEN "amountCents" ELSE 0 END),0) INTO charges_total, taxable_gross FROM "QuoteRevisionCharge" WHERE "quoteRevisionId"=rid;
  SELECT "discountCents", "discountType"::TEXT, "discountRateBasisPoints", "discountBaseCents", "taxableDiscountCents", "itemSubtotalCents", "chargeTotalCents", "subtotalCents", "totalCents" INTO discount_value, discount_type_value, discount_rate, discount_base, taxable_discount, stored_item, stored_charge, stored_subtotal, stored_total FROM "QuoteRevision" WHERE "id"=rid;
  IF discount_type_value='PERCENTAGE' THEN
    expected_discount := ((items_total + charges_total) * discount_rate + 5000) / 10000;
    expected_taxable_discount := (taxable_gross * discount_rate + 5000) / 10000;
    IF discount_base <> items_total + charges_total OR discount_value <> expected_discount OR taxable_discount <> expected_taxable_discount THEN RAISE EXCEPTION 'Percentage discount snapshot is inconsistent'; END IF;
  ELSE
    IF discount_base <> items_total + charges_total OR taxable_discount NOT IN (0, discount_value) OR
       (discount_value > 0 AND
        (SELECT "discountTaxable" FROM "QuoteRevision" WHERE "id"=rid) IS DISTINCT FROM (taxable_discount = discount_value))
    THEN RAISE EXCEPTION 'Fixed discount snapshot is inconsistent'; END IF;
  END IF;
  IF discount_value > items_total + charges_total OR taxable_discount > taxable_gross THEN RAISE EXCEPTION 'Quote discount exceeds its applicable subtotal'; END IF;
  expected_taxable := taxable_gross - taxable_discount;
  SELECT "rateBasisPoints", "taxableAmountCents", "taxAmountCents" INTO rate_value, stored_taxable, stored_tax FROM "QuoteRevisionTax" WHERE "quoteRevisionId"=rid;
  IF rate_value IS NULL THEN RAISE EXCEPTION 'Quote revision requires one tax snapshot'; END IF;
  expected_tax := (expected_taxable * rate_value + 5000) / 10000;
  IF stored_item <> items_total OR stored_charge <> charges_total OR stored_subtotal <> items_total + charges_total OR stored_taxable <> expected_taxable OR stored_tax <> expected_tax OR stored_total <> items_total + charges_total - discount_value + expected_tax THEN RAISE EXCEPTION 'Stored quote totals do not match authoritative calculation'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "QuoteRevision_totals" AFTER INSERT OR UPDATE ON "QuoteRevision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();
CREATE CONSTRAINT TRIGGER "QuoteRevisionItem_totals" AFTER INSERT OR UPDATE OR DELETE ON "QuoteRevisionItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();
CREATE CONSTRAINT TRIGGER "QuoteRevisionCharge_totals" AFTER INSERT OR UPDATE OR DELETE ON "QuoteRevisionCharge" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();
CREATE CONSTRAINT TRIGGER "QuoteRevisionTax_totals" AFTER INSERT OR UPDATE OR DELETE ON "QuoteRevisionTax" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();

CREATE FUNCTION validate_order_discount_snapshot() RETURNS trigger AS $$
DECLARE source RECORD; expected_discount BIGINT; expected_taxable_discount BIGINT;
BEGIN
  SELECT r."discountType", r."discountRateBasisPoints", r."discountBaseCents", r."discountCents", r."taxableDiscountCents" INTO source FROM "QuoteRevision" r WHERE r."id"=NEW."acceptedQuoteRevisionId";
  IF NEW."discountType" IS DISTINCT FROM source."discountType" OR NEW."discountRateBasisPoints" IS DISTINCT FROM source."discountRateBasisPoints" OR NEW."discountBaseCents" IS DISTINCT FROM source."discountBaseCents" OR NEW."discountCents" IS DISTINCT FROM source."discountCents" OR NEW."taxableDiscountCents" IS DISTINCT FROM source."taxableDiscountCents" THEN
    RAISE EXCEPTION 'Rental order discount is not an exact quote snapshot';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalOrder_discount_snapshot" BEFORE INSERT ON "RentalOrder" FOR EACH ROW EXECUTE FUNCTION validate_order_discount_snapshot();

CREATE OR REPLACE FUNCTION validate_rental_order_snapshot() RETURNS trigger AS $$
DECLARE oid TEXT; source RECORD; item_count INTEGER; source_item_count INTEGER; charge_count INTEGER; source_charge_count INTEGER; mismatches INTEGER;
BEGIN
  IF TG_TABLE_NAME='RentalOrder' THEN oid:=NEW."id"; ELSE oid:=NEW."rentalOrderId"; END IF;
  SELECT o.*, q."customerRevisionId", q."rentalRequestId" AS quote_request_id,
         r."quoteId" AS revision_quote_id, r."rentalRequestDecisionId" AS revision_decision_id,
         r."revisionNumber", r."currency" AS revision_currency, r."itemSubtotalCents" AS revision_item_total,
         r."chargeTotalCents" AS revision_charge_total, r."subtotalCents" AS revision_subtotal,
         r."discountCents" AS revision_discount, r."discountTaxable" AS revision_discount_taxable,
         r."discountType" AS revision_discount_type, r."discountRateBasisPoints" AS revision_discount_rate,
         r."discountBaseCents" AS revision_discount_base, r."taxableDiscountCents" AS revision_taxable_discount,
         r."taxableSubtotalCents" AS revision_taxable, r."taxCents" AS revision_tax,
         r."totalCents" AS revision_total, r."customerNotes" AS revision_customer_notes,
         r."terms" AS revision_terms, r."validUntil", l."state"::TEXT AS lifecycle_state,
         cr."response"::TEXT AS customer_response, cr."respondedAt", d."rentalRequestId" AS decision_request_id,
         d."outcome"::TEXT AS decision_outcome
    INTO source
    FROM "RentalOrder" o
    JOIN "Quote" q ON q."id"=o."quoteId"
    JOIN "QuoteRevision" r ON r."id"=o."acceptedQuoteRevisionId"
    JOIN "QuoteRevisionLifecycle" l ON l."quoteRevisionId"=r."id"
    JOIN "QuoteCustomerResponse" cr ON cr."quoteRevisionId"=r."id"
    JOIN "RentalRequestDecision" d ON d."id"=o."rentalRequestDecisionId"
    WHERE o."id"=oid;
  IF source."id" IS NULL OR source."customerRevisionId"<>source."acceptedQuoteRevisionId" OR
     source.revision_quote_id<>source."quoteId" OR source.quote_request_id<>source."rentalRequestId" OR
     source.revision_decision_id<>source."rentalRequestDecisionId" OR source.decision_request_id<>source."rentalRequestId" OR
     source.lifecycle_state<>'ACCEPTED' OR source.customer_response<>'ACCEPTED' OR source."respondedAt">source."validUntil" OR
     source.decision_outcome NOT IN ('APPROVED','PARTIALLY_APPROVED') THEN
    RAISE EXCEPTION 'Rental order source is not the authoritative accepted quote revision';
  END IF;
  IF source."acceptedRevisionNumber"<>source."revisionNumber" OR source."currency"<>source.revision_currency OR
     source."itemSubtotalCents"<>source.revision_item_total OR source."chargeTotalCents"<>source.revision_charge_total OR
     source."subtotalCents"<>source.revision_subtotal OR source."discountCents"<>source.revision_discount OR
     source."discountTaxable"<>source.revision_discount_taxable OR source."discountType"<>source.revision_discount_type OR
     source."discountRateBasisPoints" IS DISTINCT FROM source.revision_discount_rate OR
     source."discountBaseCents"<>source.revision_discount_base OR source."taxableDiscountCents"<>source.revision_taxable_discount OR
     source."taxableSubtotalCents"<>source.revision_taxable OR source."taxCents"<>source.revision_tax OR
     source."totalCents"<>source.revision_total OR source."quoteCustomerNotesSnapshot" IS DISTINCT FROM source.revision_customer_notes OR
     source."termsSnapshot" IS DISTINCT FROM source.revision_terms THEN
    RAISE EXCEPTION 'Rental order header is not an exact accepted quote snapshot';
  END IF;
  SELECT count(*) INTO source_item_count FROM "QuoteRevisionItem" WHERE "quoteRevisionId"=source."acceptedQuoteRevisionId";
  SELECT count(*) INTO item_count FROM "RentalOrderItem" WHERE "rentalOrderId"=oid;
  SELECT count(*) INTO mismatches FROM "RentalOrderItem" oi LEFT JOIN "QuoteRevisionItem" qi ON qi."id"=oi."sourceQuoteRevisionItemId" WHERE oi."rentalOrderId"=oid AND
    (qi."quoteRevisionId" IS DISTINCT FROM source."acceptedQuoteRevisionId" OR oi."productIdSnapshot" IS DISTINCT FROM qi."productIdSnapshot" OR
     oi."productNameSnapshot" IS DISTINCT FROM qi."productNameSnapshot" OR oi."productSlugSnapshot" IS DISTINCT FROM qi."productSlugSnapshot" OR
     oi."categoryNameSnapshot" IS DISTINCT FROM qi."categoryNameSnapshot" OR oi."categorySlugSnapshot" IS DISTINCT FROM qi."categorySlugSnapshot" OR
     oi."rentalUnitSnapshot" IS DISTINCT FROM qi."rentalUnitSnapshot" OR oi."approvedQuantitySnapshot" IS DISTINCT FROM qi."approvedQuantitySnapshot" OR
     oi."quotedQuantity" IS DISTINCT FROM qi."quotedQuantity" OR oi."unitPriceCents" IS DISTINCT FROM qi."unitPriceCents" OR
     oi."lineSubtotalCents" IS DISTINCT FROM qi."lineSubtotalCents" OR oi."taxable" IS DISTINCT FROM qi."taxable" OR oi."sortOrder" IS DISTINCT FROM qi."sortOrder");
  IF item_count<>source_item_count OR mismatches<>0 THEN RAISE EXCEPTION 'Rental order items are not exact accepted quote snapshots'; END IF;
  SELECT count(*) INTO source_charge_count FROM "QuoteRevisionCharge" WHERE "quoteRevisionId"=source."acceptedQuoteRevisionId";
  SELECT count(*) INTO charge_count FROM "RentalOrderCharge" WHERE "rentalOrderId"=oid;
  SELECT count(*) INTO mismatches FROM "RentalOrderCharge" oc LEFT JOIN "QuoteRevisionCharge" qc ON qc."id"=oc."sourceQuoteRevisionChargeId" WHERE oc."rentalOrderId"=oid AND
    (qc."quoteRevisionId" IS DISTINCT FROM source."acceptedQuoteRevisionId" OR oc."type" IS DISTINCT FROM qc."type" OR
     oc."label" IS DISTINCT FROM qc."label" OR oc."amountCents" IS DISTINCT FROM qc."amountCents" OR
     oc."taxable" IS DISTINCT FROM qc."taxable" OR oc."sortOrder" IS DISTINCT FROM qc."sortOrder");
  IF charge_count<>source_charge_count OR mismatches<>0 THEN RAISE EXCEPTION 'Rental order charges are not exact accepted quote snapshots'; END IF;
  SELECT count(*) INTO mismatches FROM "RentalOrderTax" ot LEFT JOIN "QuoteRevisionTax" qt ON qt."id"=ot."sourceQuoteRevisionTaxId" WHERE ot."rentalOrderId"=oid AND
    (qt."quoteRevisionId" IS DISTINCT FROM source."acceptedQuoteRevisionId" OR ot."name" IS DISTINCT FROM qt."name" OR
     ot."rateBasisPoints" IS DISTINCT FROM qt."rateBasisPoints" OR ot."taxableAmountCents" IS DISTINCT FROM qt."taxableAmountCents" OR
     ot."taxAmountCents" IS DISTINCT FROM qt."taxAmountCents");
  IF mismatches<>0 OR NOT EXISTS (SELECT 1 FROM "RentalOrderTax" WHERE "rentalOrderId"=oid) THEN RAISE EXCEPTION 'Rental order tax is not an exact accepted quote snapshot'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
