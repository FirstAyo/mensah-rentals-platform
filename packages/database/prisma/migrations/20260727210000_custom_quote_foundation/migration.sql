CREATE TYPE "QuoteRevisionState" AS ENUM ('DRAFT','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED','SUPERSEDED');
CREATE TYPE "QuoteChargeType" AS ENUM ('DELIVERY','PICKUP','SETUP','TEARDOWN','LABOUR','OTHER');
CREATE TYPE "QuoteCustomerResponseKind" AS ENUM ('ACCEPTED','REJECTED');
CREATE TYPE "QuoteActivityType" AS ENUM ('QUOTE_CREATED','QUOTE_REVISION_CREATED','QUOTE_SENT','QUOTE_VIEWED','QUOTE_ACCEPTED','QUOTE_REJECTED','QUOTE_EXPIRED','QUOTE_SUPERSEDED');

CREATE TABLE "Quote" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "quoteNumber" TEXT NOT NULL,
  "latestRevisionId" TEXT,
  "customerRevisionId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Quote_number_check" CHECK ("quoteNumber" ~ '^QT-[A-Z0-9]{12}$')
);
CREATE UNIQUE INDEX "Quote_rentalRequestId_key" ON "Quote"("rentalRequestId");
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");
CREATE UNIQUE INDEX "Quote_latestRevisionId_key" ON "Quote"("latestRevisionId");
CREATE UNIQUE INDEX "Quote_customerRevisionId_key" ON "Quote"("customerRevisionId");
CREATE INDEX "Quote_createdAt_id_idx" ON "Quote"("createdAt", "id");
CREATE INDEX "Quote_createdByUserId_createdAt_id_idx" ON "Quote"("createdByUserId", "createdAt", "id");

CREATE TABLE "QuoteRevision" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "rentalRequestDecisionId" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'CAD',
  "itemSubtotalCents" BIGINT NOT NULL,
  "chargeTotalCents" BIGINT NOT NULL,
  "subtotalCents" BIGINT NOT NULL,
  "discountCents" BIGINT NOT NULL,
  "discountTaxable" BOOLEAN NOT NULL DEFAULT true,
  "taxableSubtotalCents" BIGINT NOT NULL,
  "taxCents" BIGINT NOT NULL,
  "totalCents" BIGINT NOT NULL,
  "customerNotes" TEXT,
  "internalNotes" TEXT,
  "terms" TEXT,
  "validUntil" TIMESTAMPTZ(3) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteRevision_bounds_check" CHECK (
    "revisionNumber" > 0 AND "currency" = 'CAD' AND
    "itemSubtotalCents" BETWEEN 0 AND 100000000000000 AND
    "chargeTotalCents" BETWEEN 0 AND 100000000000000 AND
    "subtotalCents" BETWEEN 0 AND 100000000000000 AND
    "discountCents" BETWEEN 0 AND 100000000 AND
    "taxableSubtotalCents" BETWEEN 0 AND 100000000000000 AND
    "taxCents" BETWEEN 0 AND 100000000000000 AND
    "totalCents" BETWEEN 0 AND 100000000000000
  ),
  CONSTRAINT "QuoteRevision_text_check" CHECK (
    ("customerNotes" IS NULL OR length("customerNotes") BETWEEN 1 AND 3000) AND
    ("internalNotes" IS NULL OR length("internalNotes") BETWEEN 1 AND 5000) AND
    ("terms" IS NULL OR length("terms") BETWEEN 1 AND 10000)
  ),
  CONSTRAINT "QuoteRevision_operation_check" CHECK ("operationId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "QuoteRevision_payload_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "QuoteRevision_operationId_key" ON "QuoteRevision"("operationId");
CREATE UNIQUE INDEX "QuoteRevision_quoteId_revisionNumber_key" ON "QuoteRevision"("quoteId", "revisionNumber");
CREATE INDEX "QuoteRevision_rentalRequestDecisionId_createdAt_id_idx" ON "QuoteRevision"("rentalRequestDecisionId", "createdAt", "id");
CREATE INDEX "QuoteRevision_validUntil_id_idx" ON "QuoteRevision"("validUntil", "id");
CREATE INDEX "QuoteRevision_totalCents_id_idx" ON "QuoteRevision"("totalCents", "id");

CREATE TABLE "QuoteRevisionItem" (
  "id" TEXT NOT NULL,
  "quoteRevisionId" TEXT NOT NULL,
  "rentalRequestDecisionItemId" TEXT NOT NULL,
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
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevisionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteRevisionItem_bounds_check" CHECK (
    "approvedQuantitySnapshot" BETWEEN 1 AND 1000 AND
    "quotedQuantity" BETWEEN 1 AND "approvedQuantitySnapshot" AND
    "unitPriceCents" BETWEEN 0 AND 100000000 AND
    "lineSubtotalCents" BETWEEN 0 AND 100000000000 AND
    "sortOrder" BETWEEN 0 AND 99 AND
    "lineSubtotalCents" = "quotedQuantity"::BIGINT * "unitPriceCents"
  )
);
CREATE UNIQUE INDEX "QuoteRevisionItem_quoteRevisionId_rentalRequestDecisionItemId_key" ON "QuoteRevisionItem"("quoteRevisionId", "rentalRequestDecisionItemId");
CREATE UNIQUE INDEX "QuoteRevisionItem_quoteRevisionId_sortOrder_key" ON "QuoteRevisionItem"("quoteRevisionId", "sortOrder");
CREATE INDEX "QuoteRevisionItem_rentalRequestDecisionItemId_idx" ON "QuoteRevisionItem"("rentalRequestDecisionItemId");

CREATE TABLE "QuoteRevisionCharge" (
  "id" TEXT NOT NULL,
  "quoteRevisionId" TEXT NOT NULL,
  "type" "QuoteChargeType" NOT NULL,
  "label" TEXT NOT NULL,
  "amountCents" BIGINT NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevisionCharge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteRevisionCharge_check" CHECK (
    length(trim("label")) BETWEEN 1 AND 100 AND
    "amountCents" BETWEEN 0 AND 100000000 AND "sortOrder" BETWEEN 0 AND 24
  )
);
CREATE UNIQUE INDEX "QuoteRevisionCharge_quoteRevisionId_sortOrder_key" ON "QuoteRevisionCharge"("quoteRevisionId", "sortOrder");

CREATE TABLE "QuoteRevisionTax" (
  "id" TEXT NOT NULL,
  "quoteRevisionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rateBasisPoints" INTEGER NOT NULL,
  "taxableAmountCents" BIGINT NOT NULL,
  "taxAmountCents" BIGINT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevisionTax_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteRevisionTax_check" CHECK (
    length(trim("name")) BETWEEN 1 AND 80 AND "rateBasisPoints" BETWEEN 0 AND 10000 AND
    "taxableAmountCents" BETWEEN 0 AND 100000000000000 AND "taxAmountCents" BETWEEN 0 AND 100000000000000
  )
);
CREATE UNIQUE INDEX "QuoteRevisionTax_quoteRevisionId_key" ON "QuoteRevisionTax"("quoteRevisionId");

CREATE TABLE "QuoteRevisionLifecycle" (
  "quoteRevisionId" TEXT NOT NULL,
  "state" "QuoteRevisionState" NOT NULL DEFAULT 'DRAFT',
  "lifecycleVersion" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMPTZ(3),
  "sentByUserId" TEXT,
  "viewedAt" TIMESTAMPTZ(3),
  "terminalAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevisionLifecycle_pkey" PRIMARY KEY ("quoteRevisionId"),
  CONSTRAINT "QuoteRevisionLifecycle_version_check" CHECK ("lifecycleVersion" >= 0)
);
CREATE INDEX "QuoteRevisionLifecycle_state_updatedAt_quoteRevisionId_idx" ON "QuoteRevisionLifecycle"("state", "updatedAt", "quoteRevisionId");

CREATE TABLE "QuoteCustomerAccess" (
  "id" UUID NOT NULL,
  "quoteRevisionId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteCustomerAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteCustomerAccess_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "QuoteCustomerAccess_quoteRevisionId_key" ON "QuoteCustomerAccess"("quoteRevisionId");
CREATE UNIQUE INDEX "QuoteCustomerAccess_tokenHash_key" ON "QuoteCustomerAccess"("tokenHash");
CREATE INDEX "QuoteCustomerAccess_expiresAt_id_idx" ON "QuoteCustomerAccess"("expiresAt", "id");

CREATE TABLE "QuoteCustomerResponse" (
  "id" TEXT NOT NULL,
  "quoteRevisionId" TEXT NOT NULL,
  "response" "QuoteCustomerResponseKind" NOT NULL,
  "operationId" TEXT NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "note" TEXT,
  "respondedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteCustomerResponse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteCustomerResponse_operation_check" CHECK ("operationId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "QuoteCustomerResponse_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "QuoteCustomerResponse_note_check" CHECK ("note" IS NULL OR length("note") BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX "QuoteCustomerResponse_quoteRevisionId_key" ON "QuoteCustomerResponse"("quoteRevisionId");
CREATE UNIQUE INDEX "QuoteCustomerResponse_operationId_key" ON "QuoteCustomerResponse"("operationId");

CREATE TABLE "QuoteActivity" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "quoteRevisionId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "QuoteActivityType" NOT NULL,
  "operationId" TEXT,
  "payloadHash" CHAR(64),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteActivity_payload_hash_check" CHECK ("payloadHash" IS NULL OR "payloadHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "QuoteActivity_operationId_key" ON "QuoteActivity"("operationId");
CREATE INDEX "QuoteActivity_quoteId_createdAt_id_idx" ON "QuoteActivity"("quoteId", "createdAt", "id");
CREATE INDEX "QuoteActivity_quoteRevisionId_createdAt_id_idx" ON "QuoteActivity"("quoteRevisionId", "createdAt", "id");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rentalRequestId_fkey" FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_rentalRequestDecisionId_fkey" FOREIGN KEY ("rentalRequestDecisionId") REFERENCES "RentalRequestDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_latestRevisionId_fkey" FOREIGN KEY ("latestRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerRevisionId_fkey" FOREIGN KEY ("customerRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevisionItem" ADD CONSTRAINT "QuoteRevisionItem_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevisionItem" ADD CONSTRAINT "QuoteRevisionItem_rentalRequestDecisionItemId_fkey" FOREIGN KEY ("rentalRequestDecisionItemId") REFERENCES "RentalRequestDecisionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevisionCharge" ADD CONSTRAINT "QuoteRevisionCharge_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevisionTax" ADD CONSTRAINT "QuoteRevisionTax_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevisionLifecycle" ADD CONSTRAINT "QuoteRevisionLifecycle_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevisionLifecycle" ADD CONSTRAINT "QuoteRevisionLifecycle_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteCustomerAccess" ADD CONSTRAINT "QuoteCustomerAccess_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteCustomerResponse" ADD CONSTRAINT "QuoteCustomerResponse_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteActivity" ADD CONSTRAINT "QuoteActivity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteActivity" ADD CONSTRAINT "QuoteActivity_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteActivity" ADD CONSTRAINT "QuoteActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_quote_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Quote commercial history is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteRevision_immutable" BEFORE UPDATE OR DELETE ON "QuoteRevision" FOR EACH ROW EXECUTE FUNCTION protect_quote_append_only();
CREATE TRIGGER "QuoteRevisionItem_immutable" BEFORE UPDATE OR DELETE ON "QuoteRevisionItem" FOR EACH ROW EXECUTE FUNCTION protect_quote_append_only();
CREATE TRIGGER "QuoteRevisionCharge_immutable" BEFORE UPDATE OR DELETE ON "QuoteRevisionCharge" FOR EACH ROW EXECUTE FUNCTION protect_quote_append_only();
CREATE TRIGGER "QuoteRevisionTax_immutable" BEFORE UPDATE OR DELETE ON "QuoteRevisionTax" FOR EACH ROW EXECUTE FUNCTION protect_quote_append_only();
CREATE TRIGGER "QuoteCustomerResponse_immutable" BEFORE UPDATE OR DELETE ON "QuoteCustomerResponse" FOR EACH ROW EXECUTE FUNCTION protect_quote_append_only();
CREATE TRIGGER "QuoteActivity_immutable" BEFORE UPDATE OR DELETE ON "QuoteActivity" FOR EACH ROW EXECUTE FUNCTION protect_quote_append_only();

CREATE FUNCTION validate_quote_revision_source() RETURNS trigger AS $$
DECLARE quote_request TEXT; decision_request TEXT; decision_outcome TEXT;
BEGIN
  SELECT "rentalRequestId" INTO quote_request FROM "Quote" WHERE "id" = NEW."quoteId";
  SELECT "rentalRequestId", "outcome"::TEXT INTO decision_request, decision_outcome FROM "RentalRequestDecision" WHERE "id" = NEW."rentalRequestDecisionId";
  IF quote_request IS NULL OR decision_request IS NULL OR quote_request <> decision_request OR decision_outcome NOT IN ('APPROVED','PARTIALLY_APPROVED') THEN
    RAISE EXCEPTION 'Quote revision must reference the eligible authoritative decision';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteRevision_source" BEFORE INSERT ON "QuoteRevision" FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_source();

CREATE FUNCTION validate_quote_item_source() RETURNS trigger AS $$
DECLARE revision_decision TEXT; item_decision TEXT; approved INTEGER; p_id TEXT; p_name TEXT; p_slug TEXT; c_name TEXT; c_slug TEXT; unit_name TEXT;
BEGIN
  SELECT "rentalRequestDecisionId" INTO revision_decision FROM "QuoteRevision" WHERE "id" = NEW."quoteRevisionId";
  SELECT di."decisionId", di."approvedQuantity", ri."productId", ri."productName", ri."productSlug", ri."categoryName", ri."categorySlug", ri."rentalUnit"
  INTO item_decision, approved, p_id, p_name, p_slug, c_name, c_slug, unit_name
  FROM "RentalRequestDecisionItem" di JOIN "RentalRequestItem" ri ON ri."id" = di."rentalRequestItemId" WHERE di."id" = NEW."rentalRequestDecisionItemId";
  IF revision_decision IS NULL OR item_decision IS NULL OR revision_decision <> item_decision OR approved <= 0 OR
     NEW."approvedQuantitySnapshot" <> approved OR NEW."productIdSnapshot" <> p_id OR NEW."productNameSnapshot" <> p_name OR
     NEW."productSlugSnapshot" <> p_slug OR NEW."categoryNameSnapshot" <> c_name OR NEW."categorySlugSnapshot" <> c_slug OR NEW."rentalUnitSnapshot" <> unit_name THEN
    RAISE EXCEPTION 'Quote item must exactly snapshot a positive approved decision item';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteRevisionItem_source" BEFORE INSERT ON "QuoteRevisionItem" FOR EACH ROW EXECUTE FUNCTION validate_quote_item_source();

CREATE FUNCTION validate_quote_revision_totals() RETURNS trigger AS $$
DECLARE rid TEXT; positive_count INTEGER; quoted_count INTEGER; items_total BIGINT; charges_total BIGINT; taxable_gross BIGINT; discount_value BIGINT; discount_taxable_value BOOLEAN; expected_taxable BIGINT; rate_value INTEGER; stored_taxable BIGINT; stored_tax BIGINT; expected_tax BIGINT; stored_item BIGINT; stored_charge BIGINT; stored_subtotal BIGINT; stored_total BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'QuoteRevision' THEN rid := NEW."id"; ELSE rid := NEW."quoteRevisionId"; END IF;
  SELECT count(*) INTO positive_count FROM "RentalRequestDecisionItem" di JOIN "QuoteRevision" r ON r."rentalRequestDecisionId"=di."decisionId" WHERE r."id"=rid AND di."approvedQuantity">0;
  SELECT count(*), COALESCE(sum("lineSubtotalCents"),0), COALESCE(sum(CASE WHEN "taxable" THEN "lineSubtotalCents" ELSE 0 END),0)
    INTO quoted_count, items_total, taxable_gross FROM "QuoteRevisionItem" WHERE "quoteRevisionId"=rid;
  IF positive_count = 0 OR quoted_count <> positive_count THEN RAISE EXCEPTION 'Every positive approved item must appear exactly once'; END IF;
  SELECT COALESCE(sum("amountCents"),0), taxable_gross + COALESCE(sum(CASE WHEN "taxable" THEN "amountCents" ELSE 0 END),0)
    INTO charges_total, taxable_gross FROM "QuoteRevisionCharge" WHERE "quoteRevisionId"=rid;
  SELECT "discountCents", "discountTaxable", "itemSubtotalCents", "chargeTotalCents", "subtotalCents", "totalCents"
    INTO discount_value, discount_taxable_value, stored_item, stored_charge, stored_subtotal, stored_total FROM "QuoteRevision" WHERE "id"=rid;
  IF discount_value > items_total + charges_total OR (discount_taxable_value AND discount_value > taxable_gross) THEN RAISE EXCEPTION 'Quote discount exceeds its applicable subtotal'; END IF;
  expected_taxable := taxable_gross - CASE WHEN discount_taxable_value THEN discount_value ELSE 0 END;
  SELECT "rateBasisPoints", "taxableAmountCents", "taxAmountCents" INTO rate_value, stored_taxable, stored_tax FROM "QuoteRevisionTax" WHERE "quoteRevisionId"=rid;
  IF rate_value IS NULL THEN RAISE EXCEPTION 'Quote revision requires one tax snapshot'; END IF;
  expected_tax := (expected_taxable * rate_value + 5000) / 10000;
  IF stored_item <> items_total OR stored_charge <> charges_total OR stored_subtotal <> items_total + charges_total OR
     stored_taxable <> expected_taxable OR stored_tax <> expected_tax OR stored_total <> items_total + charges_total - discount_value + expected_tax THEN
    RAISE EXCEPTION 'Stored quote totals do not match authoritative calculation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "QuoteRevision_totals" AFTER INSERT ON "QuoteRevision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();
CREATE CONSTRAINT TRIGGER "QuoteRevisionItem_totals" AFTER INSERT ON "QuoteRevisionItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();
CREATE CONSTRAINT TRIGGER "QuoteRevisionCharge_totals" AFTER INSERT ON "QuoteRevisionCharge" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();
CREATE CONSTRAINT TRIGGER "QuoteRevisionTax_totals" AFTER INSERT ON "QuoteRevisionTax" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_revision_totals();

CREATE FUNCTION validate_quote_pointers() RETURNS trigger AS $$
DECLARE qid TEXT; max_revision INTEGER; pointer_revision INTEGER; customer_state TEXT;
BEGIN
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
CREATE TRIGGER "Quote_pointer_integrity" BEFORE UPDATE OF "latestRevisionId", "customerRevisionId" ON "Quote" FOR EACH ROW EXECUTE FUNCTION validate_quote_pointers();

CREATE FUNCTION enforce_quote_lifecycle_transition() RETURNS trigger AS $$
BEGIN
  IF OLD."state" = NEW."state" THEN RETURN NEW; END IF;
  IF (OLD."state"='DRAFT' AND NEW."state"='SENT') OR
     (OLD."state"='SENT' AND NEW."state"='VIEWED') OR
     (OLD."state" IN ('SENT','VIEWED') AND NEW."state" IN ('ACCEPTED','REJECTED','EXPIRED','SUPERSEDED')) THEN
    IF NEW."lifecycleVersion" <> OLD."lifecycleVersion" + 1 THEN RAISE EXCEPTION 'Quote lifecycle version must increment'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid quote lifecycle transition';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteRevisionLifecycle_transition" BEFORE UPDATE ON "QuoteRevisionLifecycle" FOR EACH ROW EXECUTE FUNCTION enforce_quote_lifecycle_transition();

CREATE FUNCTION protect_quote_access() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD."quoteRevisionId" IS DISTINCT FROM NEW."quoteRevisionId" OR OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash" OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION 'Quote customer access cannot be changed except for one-way revocation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QuoteCustomerAccess_protect" BEFORE UPDATE OR DELETE ON "QuoteCustomerAccess" FOR EACH ROW EXECUTE FUNCTION protect_quote_access();
