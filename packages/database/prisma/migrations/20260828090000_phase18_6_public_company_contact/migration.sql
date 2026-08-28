CREATE TYPE "ContactEnquiryType" AS ENUM (
  'GENERAL',
  'RENTAL_PROJECT',
  'DELIVERY_PICKUP',
  'EXISTING_REQUEST',
  'OTHER'
);

CREATE TYPE "ContactEnquiryStatus" AS ENUM ('NEW', 'READ', 'RESOLVED');

CREATE TABLE "ContactEnquiry" (
  "id" TEXT NOT NULL,
  "referenceNumber" VARCHAR(32) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "phone" VARCHAR(40),
  "company" VARCHAR(160),
  "enquiryType" "ContactEnquiryType" NOT NULL,
  "message" TEXT NOT NULL,
  "status" "ContactEnquiryStatus" NOT NULL DEFAULT 'NEW',
  "operationId" UUID NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "statusUpdatedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ContactEnquiry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactEnquiry_name_check" CHECK (char_length("name") BETWEEN 2 AND 160),
  CONSTRAINT "ContactEnquiry_email_check" CHECK (char_length("email") BETWEEN 3 AND 254),
  CONSTRAINT "ContactEnquiry_phone_check" CHECK ("phone" IS NULL OR char_length("phone") BETWEEN 1 AND 40),
  CONSTRAINT "ContactEnquiry_company_check" CHECK ("company" IS NULL OR char_length("company") BETWEEN 1 AND 160),
  CONSTRAINT "ContactEnquiry_message_check" CHECK (char_length("message") BETWEEN 10 AND 4000),
  CONSTRAINT "ContactEnquiry_payloadHash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ContactEnquiry_statusUpdatedByUserId_fkey" FOREIGN KEY ("statusUpdatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ContactEnquiry_referenceNumber_key" ON "ContactEnquiry"("referenceNumber");
CREATE UNIQUE INDEX "ContactEnquiry_operationId_key" ON "ContactEnquiry"("operationId");
CREATE INDEX "ContactEnquiry_status_createdAt_id_idx" ON "ContactEnquiry"("status", "createdAt", "id");
CREATE INDEX "ContactEnquiry_createdAt_id_idx" ON "ContactEnquiry"("createdAt", "id");
CREATE INDEX "ContactEnquiry_email_createdAt_idx" ON "ContactEnquiry"("email", "createdAt");
CREATE INDEX "ContactEnquiry_statusUpdatedByUserId_updatedAt_idx" ON "ContactEnquiry"("statusUpdatedByUserId", "updatedAt");

CREATE FUNCTION "protect_contact_enquiry_identity"() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status', 'statusUpdatedByUserId', 'updatedAt'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'statusUpdatedByUserId', 'updatedAt']) THEN
    RAISE EXCEPTION 'Contact enquiry submission fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContactEnquiry_protect_identity"
BEFORE UPDATE ON "ContactEnquiry"
FOR EACH ROW EXECUTE FUNCTION "protect_contact_enquiry_identity"();
