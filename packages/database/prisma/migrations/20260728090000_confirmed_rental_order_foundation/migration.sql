CREATE TYPE "RentalOrderStatus" AS ENUM ('CONFIRMED');
CREATE TYPE "RentalOrderReservationStatus" AS ENUM ('NOT_RESERVED');
CREATE TYPE "RentalOrderActivityType" AS ENUM ('ORDER_CREATED','ORDER_CUSTOMER_ACCESS_CREATED','ORDER_VIEWED');

CREATE TABLE "RentalOrder" (
  "id" TEXT PRIMARY KEY,
  "orderNumber" TEXT NOT NULL UNIQUE,
  "quoteId" TEXT NOT NULL UNIQUE,
  "acceptedQuoteRevisionId" TEXT NOT NULL UNIQUE,
  "rentalRequestId" TEXT NOT NULL UNIQUE,
  "rentalRequestDecisionId" TEXT NOT NULL UNIQUE,
  "confirmedByUserId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL UNIQUE,
  "payloadHash" CHAR(64) NOT NULL,
  "status" "RentalOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
  "reservationStatus" "RentalOrderReservationStatus" NOT NULL DEFAULT 'NOT_RESERVED',
  "acceptedRevisionNumber" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'CAD',
  "contactFirstNameSnapshot" TEXT NOT NULL,
  "contactLastNameSnapshot" TEXT NOT NULL,
  "companyNameSnapshot" TEXT,
  "contactEmailSnapshot" TEXT NOT NULL,
  "contactPhoneSnapshot" TEXT NOT NULL,
  "projectNameSnapshot" TEXT NOT NULL,
  "projectTypeSnapshot" TEXT NOT NULL,
  "projectLocationSnapshot" TEXT NOT NULL,
  "fulfillmentMethodSnapshot" "RentalRequestFulfillmentMethod" NOT NULL,
  "deliveryAddressSnapshot" TEXT,
  "rentalStartDateSnapshot" DATE NOT NULL,
  "rentalEndDateSnapshot" DATE NOT NULL,
  "requestedTimeZoneSnapshot" TEXT NOT NULL,
  "requestCustomerNotesSnapshot" TEXT,
  "quoteCustomerNotesSnapshot" TEXT,
  "termsSnapshot" TEXT,
  "itemSubtotalCents" BIGINT NOT NULL,
  "chargeTotalCents" BIGINT NOT NULL,
  "subtotalCents" BIGINT NOT NULL,
  "discountCents" BIGINT NOT NULL,
  "discountTaxable" BOOLEAN NOT NULL,
  "taxableSubtotalCents" BIGINT NOT NULL,
  "taxCents" BIGINT NOT NULL,
  "totalCents" BIGINT NOT NULL,
  "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalOrder_operation_check" CHECK ("operationId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "RentalOrder_payload_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RentalOrder_number_check" CHECK ("orderNumber" ~ '^RO-[0-9A-F]{20}$'),
  CONSTRAINT "RentalOrder_currency_check" CHECK ("currency" = 'CAD'),
  CONSTRAINT "RentalOrder_revision_check" CHECK ("acceptedRevisionNumber" > 0),
  CONSTRAINT "RentalOrder_dates_check" CHECK ("rentalStartDateSnapshot" <= "rentalEndDateSnapshot"),
  CONSTRAINT "RentalOrder_money_check" CHECK (
    "itemSubtotalCents" >= 0 AND "chargeTotalCents" >= 0 AND "subtotalCents" >= 0 AND
    "discountCents" >= 0 AND "taxableSubtotalCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0
  )
);

CREATE INDEX "RentalOrder_status_confirmedAt_id_idx" ON "RentalOrder"("status","confirmedAt","id");
CREATE INDEX "RentalOrder_reservationStatus_confirmedAt_id_idx" ON "RentalOrder"("reservationStatus","confirmedAt","id");
CREATE INDEX "RentalOrder_rentalStartDateSnapshot_rentalEndDateSnapshot_id_idx" ON "RentalOrder"("rentalStartDateSnapshot","rentalEndDateSnapshot","id");
CREATE INDEX "RentalOrder_confirmedByUserId_confirmedAt_id_idx" ON "RentalOrder"("confirmedByUserId","confirmedAt","id");
CREATE INDEX "RentalOrder_contactEmailSnapshot_confirmedAt_id_idx" ON "RentalOrder"("contactEmailSnapshot","confirmedAt","id");

CREATE TABLE "RentalOrderItem" (
  "id" TEXT PRIMARY KEY,
  "rentalOrderId" TEXT NOT NULL,
  "sourceQuoteRevisionItemId" TEXT NOT NULL UNIQUE,
  "productIdSnapshot" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "productSlugSnapshot" TEXT NOT NULL,
  "categoryNameSnapshot" TEXT NOT NULL,
  "categorySlugSnapshot" TEXT NOT NULL,
  "rentalUnitSnapshot" TEXT NOT NULL,
  "approvedQuantitySnapshot" INTEGER NOT NULL,
  "quotedQuantity" INTEGER NOT NULL,
  "unitPriceCents" BIGINT NOT NULL,
  "lineSubtotalCents" BIGINT NOT NULL,
  "taxable" BOOLEAN NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalOrderItem_order_sort_key" UNIQUE ("rentalOrderId","sortOrder"),
  CONSTRAINT "RentalOrderItem_quantity_check" CHECK ("approvedQuantitySnapshot" > 0 AND "quotedQuantity" > 0 AND "quotedQuantity" <= "approvedQuantitySnapshot"),
  CONSTRAINT "RentalOrderItem_money_check" CHECK ("unitPriceCents" >= 0 AND "lineSubtotalCents" = "quotedQuantity"::BIGINT * "unitPriceCents")
);
CREATE INDEX "RentalOrderItem_order_created_idx" ON "RentalOrderItem"("rentalOrderId","createdAt","id");

CREATE TABLE "RentalOrderCharge" (
  "id" TEXT PRIMARY KEY,
  "rentalOrderId" TEXT NOT NULL,
  "sourceQuoteRevisionChargeId" TEXT NOT NULL UNIQUE,
  "type" "QuoteChargeType" NOT NULL,
  "label" TEXT NOT NULL,
  "amountCents" BIGINT NOT NULL,
  "taxable" BOOLEAN NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalOrderCharge_order_sort_key" UNIQUE ("rentalOrderId","sortOrder"),
  CONSTRAINT "RentalOrderCharge_amount_check" CHECK ("amountCents" >= 0)
);

CREATE TABLE "RentalOrderTax" (
  "id" TEXT PRIMARY KEY,
  "rentalOrderId" TEXT NOT NULL UNIQUE,
  "sourceQuoteRevisionTaxId" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "rateBasisPoints" INTEGER NOT NULL,
  "taxableAmountCents" BIGINT NOT NULL,
  "taxAmountCents" BIGINT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalOrderTax_rate_check" CHECK ("rateBasisPoints" BETWEEN 0 AND 10000),
  CONSTRAINT "RentalOrderTax_amount_check" CHECK ("taxableAmountCents" >= 0 AND "taxAmountCents" >= 0)
);

CREATE TABLE "RentalOrderActivity" (
  "id" TEXT PRIMARY KEY,
  "rentalOrderId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "RentalOrderActivityType" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RentalOrderActivity_order_created_idx" ON "RentalOrderActivity"("rentalOrderId","createdAt","id");
CREATE INDEX "RentalOrderActivity_actor_created_idx" ON "RentalOrderActivity"("actorUserId","createdAt","id");

CREATE TABLE "OrderCustomerAccess" (
  "id" UUID PRIMARY KEY,
  "rentalOrderId" TEXT NOT NULL UNIQUE,
  "tokenHash" CHAR(64) NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "firstViewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderCustomerAccess_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "OrderCustomerAccess_expiresAt_id_idx" ON "OrderCustomerAccess"("expiresAt","id");

ALTER TABLE "RentalOrder" ADD CONSTRAINT "RentalOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrder" ADD CONSTRAINT "RentalOrder_acceptedQuoteRevisionId_fkey" FOREIGN KEY ("acceptedQuoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrder" ADD CONSTRAINT "RentalOrder_rentalRequestId_fkey" FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrder" ADD CONSTRAINT "RentalOrder_rentalRequestDecisionId_fkey" FOREIGN KEY ("rentalRequestDecisionId") REFERENCES "RentalRequestDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrder" ADD CONSTRAINT "RentalOrder_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrderItem" ADD CONSTRAINT "RentalOrderItem_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrderCharge" ADD CONSTRAINT "RentalOrderCharge_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrderTax" ADD CONSTRAINT "RentalOrderTax_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrderActivity" ADD CONSTRAINT "RentalOrderActivity_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalOrderActivity" ADD CONSTRAINT "RentalOrderActivity_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderCustomerAccess" ADD CONSTRAINT "OrderCustomerAccess_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_rental_order_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Confirmed rental order history is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalOrder_immutable" BEFORE UPDATE OR DELETE ON "RentalOrder" FOR EACH ROW EXECUTE FUNCTION protect_rental_order_append_only();
CREATE TRIGGER "RentalOrderItem_immutable" BEFORE UPDATE OR DELETE ON "RentalOrderItem" FOR EACH ROW EXECUTE FUNCTION protect_rental_order_append_only();
CREATE TRIGGER "RentalOrderCharge_immutable" BEFORE UPDATE OR DELETE ON "RentalOrderCharge" FOR EACH ROW EXECUTE FUNCTION protect_rental_order_append_only();
CREATE TRIGGER "RentalOrderTax_immutable" BEFORE UPDATE OR DELETE ON "RentalOrderTax" FOR EACH ROW EXECUTE FUNCTION protect_rental_order_append_only();
CREATE TRIGGER "RentalOrderActivity_immutable" BEFORE UPDATE OR DELETE ON "RentalOrderActivity" FOR EACH ROW EXECUTE FUNCTION protect_rental_order_append_only();

CREATE FUNCTION protect_order_customer_access() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD."rentalOrderId" IS DISTINCT FROM NEW."rentalOrderId" OR OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash" OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
     (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") OR
     (OLD."firstViewedAt" IS NOT NULL AND NEW."firstViewedAt" IS DISTINCT FROM OLD."firstViewedAt") THEN
    RAISE EXCEPTION 'Order customer access can only be revoked or marked viewed once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "OrderCustomerAccess_protect" BEFORE UPDATE OR DELETE ON "OrderCustomerAccess" FOR EACH ROW EXECUTE FUNCTION protect_order_customer_access();

CREATE FUNCTION validate_rental_order_snapshot() RETURNS trigger AS $$
DECLARE oid TEXT; source RECORD; request_row RECORD; item_count INTEGER; source_item_count INTEGER; charge_count INTEGER; source_charge_count INTEGER; item_total BIGINT; charge_total BIGINT; taxable_gross BIGINT; expected_taxable BIGINT; expected_tax BIGINT; mismatches INTEGER;
BEGIN
  IF TG_TABLE_NAME='RentalOrder' THEN oid:=NEW."id"; ELSE oid:=NEW."rentalOrderId"; END IF;
  SELECT o.*, q."rentalRequestId" AS quote_request_id, q."customerRevisionId", r."quoteId" AS revision_quote_id,
         r."rentalRequestDecisionId" AS revision_decision_id, r."revisionNumber", r."currency" AS revision_currency,
         r."itemSubtotalCents" AS revision_item_total, r."chargeTotalCents" AS revision_charge_total,
         r."subtotalCents" AS revision_subtotal, r."discountCents" AS revision_discount,
         r."discountTaxable" AS revision_discount_taxable, r."taxableSubtotalCents" AS revision_taxable,
         r."taxCents" AS revision_tax, r."totalCents" AS revision_total, r."customerNotes" AS revision_customer_notes,
         r."terms" AS revision_terms, r."validUntil", l."state"::TEXT AS lifecycle_state, l."terminalAt",
         cr."response"::TEXT AS customer_response, cr."respondedAt", d."rentalRequestId" AS decision_request_id, d."outcome"::TEXT AS decision_outcome
    INTO source
    FROM "RentalOrder" o JOIN "Quote" q ON q."id"=o."quoteId"
    JOIN "QuoteRevision" r ON r."id"=o."acceptedQuoteRevisionId"
    JOIN "QuoteRevisionLifecycle" l ON l."quoteRevisionId"=r."id"
    JOIN "QuoteCustomerResponse" cr ON cr."quoteRevisionId"=r."id"
    JOIN "RentalRequestDecision" d ON d."id"=o."rentalRequestDecisionId"
    WHERE o."id"=oid;
  IF source."id" IS NULL OR source."customerRevisionId"<>source."acceptedQuoteRevisionId" OR source.revision_quote_id<>source."quoteId" OR source.quote_request_id<>source."rentalRequestId" OR source.revision_decision_id<>source."rentalRequestDecisionId" OR source.decision_request_id<>source."rentalRequestId" OR source.lifecycle_state<>'ACCEPTED' OR source.customer_response<>'ACCEPTED' OR source."respondedAt">source."validUntil" OR source."terminalAt" IS NULL OR source.decision_outcome NOT IN ('APPROVED','PARTIALLY_APPROVED') THEN
    RAISE EXCEPTION 'Rental order source is not the authoritative accepted quote revision';
  END IF;
  SELECT * INTO request_row FROM "RentalRequest" WHERE "id"=source."rentalRequestId";
  IF request_row."status"::TEXT NOT IN ('APPROVED','PARTIALLY_APPROVED') OR source."acceptedRevisionNumber"<>source."revisionNumber" OR source."currency"<>source.revision_currency OR source."itemSubtotalCents"<>source.revision_item_total OR source."chargeTotalCents"<>source.revision_charge_total OR source."subtotalCents"<>source.revision_subtotal OR source."discountCents"<>source.revision_discount OR source."discountTaxable"<>source.revision_discount_taxable OR source."taxableSubtotalCents"<>source.revision_taxable OR source."taxCents"<>source.revision_tax OR source."totalCents"<>source.revision_total OR source."quoteCustomerNotesSnapshot" IS DISTINCT FROM source.revision_customer_notes OR source."termsSnapshot" IS DISTINCT FROM source.revision_terms OR source."contactFirstNameSnapshot"<>request_row."contactFirstName" OR source."contactLastNameSnapshot"<>request_row."contactLastName" OR source."companyNameSnapshot" IS DISTINCT FROM request_row."companyName" OR source."contactEmailSnapshot"<>request_row."contactEmail" OR source."contactPhoneSnapshot"<>request_row."contactPhone" OR source."projectNameSnapshot"<>request_row."projectName" OR source."projectTypeSnapshot"<>request_row."projectType" OR source."projectLocationSnapshot"<>request_row."projectLocation" OR source."fulfillmentMethodSnapshot"<>request_row."fulfillmentMethod" OR source."deliveryAddressSnapshot" IS DISTINCT FROM request_row."deliveryAddress" OR source."rentalStartDateSnapshot"<>request_row."rentalStartDate" OR source."rentalEndDateSnapshot"<>request_row."rentalEndDate" OR source."requestedTimeZoneSnapshot"<>request_row."requestedTimeZone" OR source."requestCustomerNotesSnapshot" IS DISTINCT FROM request_row."customerNotes" THEN
    RAISE EXCEPTION 'Rental order header is not an exact source snapshot';
  END IF;
  SELECT count(*) INTO source_item_count FROM "QuoteRevisionItem" WHERE "quoteRevisionId"=source."acceptedQuoteRevisionId";
  SELECT count(*), COALESCE(sum("lineSubtotalCents"),0), COALESCE(sum(CASE WHEN "taxable" THEN "lineSubtotalCents" ELSE 0 END),0) INTO item_count,item_total,taxable_gross FROM "RentalOrderItem" WHERE "rentalOrderId"=oid;
  SELECT count(*) INTO mismatches FROM "RentalOrderItem" oi LEFT JOIN "QuoteRevisionItem" qi ON qi."id"=oi."sourceQuoteRevisionItemId" WHERE oi."rentalOrderId"=oid AND (qi."quoteRevisionId" IS DISTINCT FROM source."acceptedQuoteRevisionId" OR oi."productIdSnapshot" IS DISTINCT FROM qi."productIdSnapshot" OR oi."productNameSnapshot" IS DISTINCT FROM qi."productNameSnapshot" OR oi."productSlugSnapshot" IS DISTINCT FROM qi."productSlugSnapshot" OR oi."categoryNameSnapshot" IS DISTINCT FROM qi."categoryNameSnapshot" OR oi."categorySlugSnapshot" IS DISTINCT FROM qi."categorySlugSnapshot" OR oi."rentalUnitSnapshot" IS DISTINCT FROM qi."rentalUnitSnapshot" OR oi."approvedQuantitySnapshot" IS DISTINCT FROM qi."approvedQuantitySnapshot" OR oi."quotedQuantity" IS DISTINCT FROM qi."quotedQuantity" OR oi."unitPriceCents" IS DISTINCT FROM qi."unitPriceCents" OR oi."lineSubtotalCents" IS DISTINCT FROM qi."lineSubtotalCents" OR oi."taxable" IS DISTINCT FROM qi."taxable" OR oi."sortOrder" IS DISTINCT FROM qi."sortOrder");
  IF item_count<>source_item_count OR mismatches<>0 THEN RAISE EXCEPTION 'Rental order items are not exact accepted quote snapshots'; END IF;
  SELECT count(*) INTO source_charge_count FROM "QuoteRevisionCharge" WHERE "quoteRevisionId"=source."acceptedQuoteRevisionId";
  SELECT count(*),COALESCE(sum("amountCents"),0),taxable_gross+COALESCE(sum(CASE WHEN "taxable" THEN "amountCents" ELSE 0 END),0) INTO charge_count,charge_total,taxable_gross FROM "RentalOrderCharge" WHERE "rentalOrderId"=oid;
  SELECT count(*) INTO mismatches FROM "RentalOrderCharge" oc LEFT JOIN "QuoteRevisionCharge" qc ON qc."id"=oc."sourceQuoteRevisionChargeId" WHERE oc."rentalOrderId"=oid AND (qc."quoteRevisionId" IS DISTINCT FROM source."acceptedQuoteRevisionId" OR oc."type" IS DISTINCT FROM qc."type" OR oc."label" IS DISTINCT FROM qc."label" OR oc."amountCents" IS DISTINCT FROM qc."amountCents" OR oc."taxable" IS DISTINCT FROM qc."taxable" OR oc."sortOrder" IS DISTINCT FROM qc."sortOrder");
  IF charge_count<>source_charge_count OR mismatches<>0 THEN RAISE EXCEPTION 'Rental order charges are not exact accepted quote snapshots'; END IF;
  expected_taxable:=taxable_gross-CASE WHEN source."discountTaxable" THEN source."discountCents" ELSE 0 END;
  SELECT count(*) INTO mismatches FROM "RentalOrderTax" ot LEFT JOIN "QuoteRevisionTax" qt ON qt."id"=ot."sourceQuoteRevisionTaxId" WHERE ot."rentalOrderId"=oid AND (qt."quoteRevisionId" IS DISTINCT FROM source."acceptedQuoteRevisionId" OR ot."name" IS DISTINCT FROM qt."name" OR ot."rateBasisPoints" IS DISTINCT FROM qt."rateBasisPoints" OR ot."taxableAmountCents" IS DISTINCT FROM qt."taxableAmountCents" OR ot."taxAmountCents" IS DISTINCT FROM qt."taxAmountCents");
  SELECT (expected_taxable*t."rateBasisPoints"+5000)/10000 INTO expected_tax FROM "RentalOrderTax" t WHERE t."rentalOrderId"=oid;
  IF mismatches<>0 OR expected_tax IS NULL OR item_total<>source."itemSubtotalCents" OR charge_total<>source."chargeTotalCents" OR expected_taxable<>source."taxableSubtotalCents" OR expected_tax<>source."taxCents" OR source."subtotalCents"<>item_total+charge_total OR source."totalCents"<>item_total+charge_total-source."discountCents"+expected_tax THEN
    RAISE EXCEPTION 'Rental order totals are inconsistent';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "RentalOrder_snapshot" AFTER INSERT ON "RentalOrder" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_order_snapshot();
CREATE CONSTRAINT TRIGGER "RentalOrderItem_snapshot" AFTER INSERT ON "RentalOrderItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_order_snapshot();
CREATE CONSTRAINT TRIGGER "RentalOrderCharge_snapshot" AFTER INSERT ON "RentalOrderCharge" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_order_snapshot();
CREATE CONSTRAINT TRIGGER "RentalOrderTax_snapshot" AFTER INSERT ON "RentalOrderTax" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rental_order_snapshot();

CREATE OR REPLACE FUNCTION validate_quote_pointers() RETURNS trigger AS $$
DECLARE qid TEXT; max_revision INTEGER; pointer_revision INTEGER; customer_state TEXT;
BEGIN
  IF OLD."customerRevisionId" IS NOT NULL AND NEW."customerRevisionId" IS DISTINCT FROM OLD."customerRevisionId" AND EXISTS (SELECT 1 FROM "RentalOrder" WHERE "acceptedQuoteRevisionId"=OLD."customerRevisionId") THEN
    RAISE EXCEPTION 'An ordered accepted quote revision cannot be displaced';
  END IF;
  IF NEW."latestRevisionId" IS NOT NULL THEN
    SELECT "quoteId", "revisionNumber" INTO qid, pointer_revision FROM "QuoteRevision" WHERE "id"=NEW."latestRevisionId";
    SELECT max("revisionNumber") INTO max_revision FROM "QuoteRevision" WHERE "quoteId"=NEW."id";
    IF qid IS DISTINCT FROM NEW."id" OR pointer_revision IS DISTINCT FROM max_revision THEN RAISE EXCEPTION 'Latest revision pointer is invalid'; END IF;
  END IF;
  IF NEW."customerRevisionId" IS NOT NULL THEN
    SELECT r."quoteId", l."state"::TEXT INTO qid, customer_state FROM "QuoteRevision" r JOIN "QuoteRevisionLifecycle" l ON l."quoteRevisionId"=r."id" WHERE r."id"=NEW."customerRevisionId";
    IF qid IS DISTINCT FROM NEW."id" OR customer_state NOT IN ('SENT','VIEWED','ACCEPTED','REJECTED') THEN RAISE EXCEPTION 'Customer revision pointer is invalid'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
