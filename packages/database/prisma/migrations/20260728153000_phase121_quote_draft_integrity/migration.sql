CREATE OR REPLACE FUNCTION protect_quote_append_only() RETURNS trigger AS $$
DECLARE revision_id TEXT; revision_state TEXT;
BEGIN
  IF TG_TABLE_NAME = 'QuoteRevision' THEN
    revision_id := COALESCE(NEW."id", OLD."id");
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Quote revisions cannot be deleted'; END IF;
    IF OLD."id" IS DISTINCT FROM NEW."id" OR
       OLD."quoteId" IS DISTINCT FROM NEW."quoteId" OR
       OLD."revisionNumber" IS DISTINCT FROM NEW."revisionNumber" OR
       OLD."rentalRequestDecisionId" IS DISTINCT FROM NEW."rentalRequestDecisionId" OR
       OLD."currency" IS DISTINCT FROM NEW."currency" OR
       OLD."contactFirstNameSnapshot" IS DISTINCT FROM NEW."contactFirstNameSnapshot" OR
       OLD."contactLastNameSnapshot" IS DISTINCT FROM NEW."contactLastNameSnapshot" OR
       OLD."companyNameSnapshot" IS DISTINCT FROM NEW."companyNameSnapshot" OR
       OLD."projectNameSnapshot" IS DISTINCT FROM NEW."projectNameSnapshot" OR
       OLD."projectTypeSnapshot" IS DISTINCT FROM NEW."projectTypeSnapshot" OR
       OLD."projectLocationSnapshot" IS DISTINCT FROM NEW."projectLocationSnapshot" OR
       OLD."fulfillmentMethodSnapshot" IS DISTINCT FROM NEW."fulfillmentMethodSnapshot" OR
       OLD."deliveryAddressSnapshot" IS DISTINCT FROM NEW."deliveryAddressSnapshot" OR
       OLD."rentalStartDateSnapshot" IS DISTINCT FROM NEW."rentalStartDateSnapshot" OR
       OLD."rentalEndDateSnapshot" IS DISTINCT FROM NEW."rentalEndDateSnapshot" OR
       OLD."requestedTimeZoneSnapshot" IS DISTINCT FROM NEW."requestedTimeZoneSnapshot" OR
       OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId" OR
       OLD."operationId" IS DISTINCT FROM NEW."operationId" OR
       OLD."payloadHash" IS DISTINCT FROM NEW."payloadHash" OR
       OLD."createdAt" IS DISTINCT FROM NEW."createdAt" OR
       NEW."draftVersion" <> OLD."draftVersion" + 1 THEN
      RAISE EXCEPTION 'Draft quote identity and source snapshots are immutable';
    END IF;
  ELSIF TG_TABLE_NAME IN ('QuoteRevisionItem', 'QuoteRevisionCharge', 'QuoteRevisionTax') THEN
    revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."quoteRevisionId" ELSE NEW."quoteRevisionId" END;
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Draft quote child snapshots must be replaced, not updated';
    END IF;
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
