-- Deferred row triggers retain the row image from the statement that queued
-- them. Re-read the authoritative row at constraint-check time so a request
-- created and assigned its initial revision in one transaction is valid.
CREATE OR REPLACE FUNCTION validate_rental_request_current_revision()
RETURNS trigger AS $$
DECLARE
  current_revision_id TEXT;
  owner_id TEXT;
BEGIN
  SELECT "currentRevisionId"
    INTO current_revision_id
    FROM "RentalRequest"
    WHERE "id" = NEW."id";
  IF current_revision_id IS NULL THEN
    RAISE EXCEPTION 'Rental request requires a current revision';
  END IF;
  SELECT "rentalRequestId"
    INTO owner_id
    FROM "RentalRequestRevision"
    WHERE "id" = current_revision_id;
  IF owner_id IS DISTINCT FROM NEW."id" THEN
    RAISE EXCEPTION 'Current revision must belong to the rental request';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
