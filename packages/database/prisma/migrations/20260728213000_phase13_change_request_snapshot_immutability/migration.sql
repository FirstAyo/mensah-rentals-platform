-- Formal change requests preserve the proposal and every source/customer
-- snapshot exactly as submitted. Only the explicit staff review-state columns
-- (status, reviewedAt, reviewedByUserId, reviewNote, reviewVersion) may change.
CREATE OR REPLACE FUNCTION protect_change_request_history()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rental change requests are append-only';
  END IF;

  IF ROW(
    OLD."id",
    OLD."rentalRequestId",
    OLD."sourceRevisionId",
    OLD."quoteId",
    OLD."acceptedQuoteRevisionId",
    OLD."rentalOrderId",
    OLD."submittedByCustomerAccessId",
    OLD."reason",
    OLD."contactFirstName",
    OLD."contactLastName",
    OLD."contactEmail",
    OLD."contactPhone",
    OLD."companyName",
    OLD."projectName",
    OLD."projectType",
    OLD."projectLocation",
    OLD."fulfillmentMethod",
    OLD."deliveryAddress",
    OLD."rentalStartDate",
    OLD."rentalEndDate",
    OLD."requestedTimeZone",
    OLD."customerNotes",
    OLD."operationId",
    OLD."payloadHash",
    OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."id",
    NEW."rentalRequestId",
    NEW."sourceRevisionId",
    NEW."quoteId",
    NEW."acceptedQuoteRevisionId",
    NEW."rentalOrderId",
    NEW."submittedByCustomerAccessId",
    NEW."reason",
    NEW."contactFirstName",
    NEW."contactLastName",
    NEW."contactEmail",
    NEW."contactPhone",
    NEW."companyName",
    NEW."projectName",
    NEW."projectType",
    NEW."projectLocation",
    NEW."fulfillmentMethod",
    NEW."deliveryAddress",
    NEW."rentalStartDate",
    NEW."rentalEndDate",
    NEW."requestedTimeZone",
    NEW."customerNotes",
    NEW."operationId",
    NEW."payloadHash",
    NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'Rental change request proposal and source snapshots are immutable';
  END IF;

  IF NEW."reviewVersion" <> OLD."reviewVersion" + 1 THEN
    RAISE EXCEPTION 'Rental change request review version must increment';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
