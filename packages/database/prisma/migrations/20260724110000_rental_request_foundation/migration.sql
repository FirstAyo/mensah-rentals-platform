CREATE TYPE "RentalRequestStatus" AS ENUM ('SUBMITTED');
CREATE TYPE "RentalRequestFulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY', 'DELIVERY_AND_SETUP');

CREATE TABLE "GuestRequestSession" (
  "id" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "GuestRequestSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestRequestSession_tokenHash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "RentalRequest" (
  "id" TEXT NOT NULL,
  "referenceNumber" TEXT NOT NULL,
  "submissionKeyHash" CHAR(64) NOT NULL,
  "submissionPayloadHash" CHAR(64) NOT NULL,
  "sourceCartTokenHash" CHAR(64) NOT NULL,
  "guestSessionId" TEXT NOT NULL,
  "status" "RentalRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "fulfillmentMethod" "RentalRequestFulfillmentMethod" NOT NULL,
  "contactFirstName" TEXT NOT NULL,
  "contactLastName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "companyName" TEXT,
  "projectName" TEXT NOT NULL,
  "projectType" TEXT NOT NULL,
  "projectLocation" TEXT NOT NULL,
  "deliveryAddress" TEXT,
  "rentalStartDate" DATE NOT NULL,
  "rentalEndDate" DATE NOT NULL,
  "requestedTimeZone" TEXT NOT NULL,
  "customerNotes" TEXT,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RentalRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequest_reference_check" CHECK ("referenceNumber" ~ '^MR-[0-9]{4}-[A-Z0-9]{10}$'),
  CONSTRAINT "RentalRequest_submissionKeyHash_check" CHECK ("submissionKeyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RentalRequest_submissionPayloadHash_check" CHECK ("submissionPayloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RentalRequest_sourceCartTokenHash_check" CHECK ("sourceCartTokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "RentalRequest_dates_check" CHECK ("rentalEndDate" >= "rentalStartDate" AND "rentalEndDate" - "rentalStartDate" <= 366),
  CONSTRAINT "RentalRequest_required_text_check" CHECK (
    length(trim("contactFirstName")) BETWEEN 1 AND 100 AND
    length(trim("contactLastName")) BETWEEN 1 AND 100 AND
    length(trim("contactEmail")) BETWEEN 3 AND 254 AND
    length(trim("contactPhone")) BETWEEN 7 AND 30 AND
    length(trim("projectName")) BETWEEN 1 AND 160 AND
    length(trim("projectType")) BETWEEN 1 AND 100 AND
    length(trim("projectLocation")) BETWEEN 1 AND 500 AND
    length(trim("requestedTimeZone")) BETWEEN 1 AND 100
  ),
  CONSTRAINT "RentalRequest_delivery_check" CHECK (
    "fulfillmentMethod" = 'PICKUP' OR
    ("deliveryAddress" IS NOT NULL AND length(trim("deliveryAddress")) BETWEEN 1 AND 500)
  )
);

CREATE TABLE "RentalRequestItem" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "productName" TEXT NOT NULL,
  "productSlug" TEXT NOT NULL,
  "categoryName" TEXT NOT NULL,
  "categorySlug" TEXT NOT NULL,
  "rentalUnit" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestItem_quantity_check" CHECK ("requestedQuantity" BETWEEN 1 AND 1000),
  CONSTRAINT "RentalRequestItem_snapshot_check" CHECK (
    length(trim("productName")) > 0 AND
    length(trim("productSlug")) > 0 AND
    length(trim("categoryName")) > 0 AND
    length(trim("categorySlug")) > 0 AND
    length(trim("rentalUnit")) > 0
  )
);

CREATE UNIQUE INDEX "GuestRequestSession_tokenHash_key" ON "GuestRequestSession"("tokenHash");
CREATE INDEX "GuestRequestSession_expiresAt_id_idx" ON "GuestRequestSession"("expiresAt", "id");
CREATE UNIQUE INDEX "RentalRequest_referenceNumber_key" ON "RentalRequest"("referenceNumber");
CREATE UNIQUE INDEX "RentalRequest_submissionKeyHash_key" ON "RentalRequest"("submissionKeyHash");
CREATE UNIQUE INDEX "RentalRequest_sourceCartTokenHash_key" ON "RentalRequest"("sourceCartTokenHash");
CREATE INDEX "RentalRequest_guestSessionId_submittedAt_id_idx" ON "RentalRequest"("guestSessionId", "submittedAt", "id");
CREATE INDEX "RentalRequest_status_submittedAt_id_idx" ON "RentalRequest"("status", "submittedAt", "id");
CREATE INDEX "RentalRequest_contactEmail_submittedAt_idx" ON "RentalRequest"("contactEmail", "submittedAt");
CREATE UNIQUE INDEX "RentalRequestItem_rentalRequestId_productId_key" ON "RentalRequestItem"("rentalRequestId", "productId");
CREATE INDEX "RentalRequestItem_productId_idx" ON "RentalRequestItem"("productId");

ALTER TABLE "RentalRequest" ADD CONSTRAINT "RentalRequest_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestRequestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestItem" ADD CONSTRAINT "RentalRequestItem_rentalRequestId_fkey" FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestItem" ADD CONSTRAINT "RentalRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_rental_request_item() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rental request item snapshots are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequestItem_immutable_update" BEFORE UPDATE ON "RentalRequestItem" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_item();
CREATE TRIGGER "RentalRequestItem_immutable_delete" BEFORE DELETE ON "RentalRequestItem" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_item();

CREATE FUNCTION protect_rental_request_submission() RETURNS trigger AS $$
BEGIN
  IF OLD."referenceNumber" IS DISTINCT FROM NEW."referenceNumber"
    OR OLD."submissionKeyHash" IS DISTINCT FROM NEW."submissionKeyHash"
    OR OLD."submissionPayloadHash" IS DISTINCT FROM NEW."submissionPayloadHash"
    OR OLD."sourceCartTokenHash" IS DISTINCT FROM NEW."sourceCartTokenHash"
    OR OLD."guestSessionId" IS DISTINCT FROM NEW."guestSessionId"
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
CREATE TRIGGER "RentalRequest_submission_immutable" BEFORE UPDATE ON "RentalRequest" FOR EACH ROW EXECUTE FUNCTION protect_rental_request_submission();
