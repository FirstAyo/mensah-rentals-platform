-- Guest tracking capabilities are temporary access records. Expiring one must
-- preserve the durable rental request and its immutable item snapshots.
ALTER TABLE "RentalRequest"
DROP CONSTRAINT "RentalRequest_guestSessionId_fkey";

ALTER TABLE "RentalRequest"
ALTER COLUMN "guestSessionId" DROP NOT NULL;

ALTER TABLE "RentalRequest"
ADD CONSTRAINT "RentalRequest_guestSessionId_fkey"
FOREIGN KEY ("guestSessionId") REFERENCES "GuestRequestSession"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_rental_request_submission() RETURNS trigger AS $$
BEGIN
  IF OLD."referenceNumber" IS DISTINCT FROM NEW."referenceNumber"
    OR OLD."submissionKeyHash" IS DISTINCT FROM NEW."submissionKeyHash"
    OR OLD."submissionPayloadHash" IS DISTINCT FROM NEW."submissionPayloadHash"
    OR OLD."sourceCartTokenHash" IS DISTINCT FROM NEW."sourceCartTokenHash"
    OR (OLD."guestSessionId" IS NULL AND NEW."guestSessionId" IS NOT NULL)
    OR (OLD."guestSessionId" IS NOT NULL AND NEW."guestSessionId" IS NOT NULL
      AND OLD."guestSessionId" IS DISTINCT FROM NEW."guestSessionId")
    OR OLD."fulfillmentMethod" IS DISTINCT FROM NEW."fulfillmentMethod"
    OR OLD."contactFirstName" IS DISTINCT FROM NEW."contactFirstName"
    OR OLD."contactLastName" IS DISTINCT FROM NEW."contactLastName"
    OR OLD."contactEmail" IS DISTINCT FROM NEW."contactEmail"
    OR OLD."contactPhone" IS DISTINCT FROM NEW."contactPhone"
    OR OLD."companyName" IS DISTINCT FROM NEW."companyName"
    OR OLD."projectName" IS DISTINCT FROM NEW."projectName"
    OR OLD."projectType" IS DISTINCT FROM NEW."projectType"
    OR OLD."projectLocation" IS DISTINCT FROM NEW."projectLocation"
    OR OLD."deliveryAddress" IS DISTINCT FROM NEW."deliveryAddress"
    OR OLD."rentalStartDate" IS DISTINCT FROM NEW."rentalStartDate"
    OR OLD."rentalEndDate" IS DISTINCT FROM NEW."rentalEndDate"
    OR OLD."requestedTimeZone" IS DISTINCT FROM NEW."requestedTimeZone"
    OR OLD."customerNotes" IS DISTINCT FROM NEW."customerNotes"
    OR OLD."submittedAt" IS DISTINCT FROM NEW."submittedAt"
  THEN
    RAISE EXCEPTION 'Submitted rental request details are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
