ALTER TYPE "RentalRequestStatus" ADD VALUE 'UNDER_REVIEW';

CREATE TYPE "RentalRequestActivityType" AS ENUM (
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'NOTE_ADDED',
  'REVIEW_STARTED'
);

ALTER TABLE "RentalRequest"
ADD COLUMN "assignedToUserId" TEXT,
ADD COLUMN "assignedAt" TIMESTAMPTZ(3),
ADD COLUMN "reviewStartedAt" TIMESTAMPTZ(3),
ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "RentalRequest_reviewVersion_check" CHECK ("reviewVersion" >= 0),
ADD CONSTRAINT "RentalRequest_assignment_check" CHECK (
  ("assignedToUserId" IS NULL AND "assignedAt" IS NULL)
  OR ("assignedToUserId" IS NOT NULL AND "assignedAt" IS NOT NULL)
);

ALTER TABLE "RentalRequest"
ADD CONSTRAINT "RentalRequest_assignedToUserId_fkey"
FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RentalRequest_assignedToUserId_submittedAt_id_idx"
ON "RentalRequest"("assignedToUserId", "submittedAt", "id");
CREATE INDEX "RentalRequest_rentalStartDate_submittedAt_id_idx"
ON "RentalRequest"("rentalStartDate", "submittedAt", "id");
CREATE INDEX "RentalRequest_updatedAt_id_idx"
ON "RentalRequest"("updatedAt", "id");

CREATE TABLE "RentalRequestInternalNote" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestInternalNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestInternalNote_operationId_check" CHECK (
    "operationId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "RentalRequestInternalNote_body_check" CHECK (
    length(trim("body")) BETWEEN 1 AND 3000
  )
);

CREATE UNIQUE INDEX "RentalRequestInternalNote_operationId_key"
ON "RentalRequestInternalNote"("operationId");
CREATE INDEX "RentalRequestInternalNote_rentalRequestId_createdAt_id_idx"
ON "RentalRequestInternalNote"("rentalRequestId", "createdAt", "id");
CREATE INDEX "RentalRequestInternalNote_authorUserId_createdAt_id_idx"
ON "RentalRequestInternalNote"("authorUserId", "createdAt", "id");

ALTER TABLE "RentalRequestInternalNote"
ADD CONSTRAINT "RentalRequestInternalNote_rentalRequestId_fkey"
FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestInternalNote"
ADD CONSTRAINT "RentalRequestInternalNote_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RentalRequestActivity" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "RentalRequestActivityType" NOT NULL,
  "previousAssigneeUserId" TEXT,
  "newAssigneeUserId" TEXT,
  "noteId" TEXT,
  "previousStatus" "RentalRequestStatus",
  "newStatus" "RentalRequestStatus",
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RentalRequestActivity_noteId_key"
ON "RentalRequestActivity"("noteId");
CREATE INDEX "RentalRequestActivity_rentalRequestId_createdAt_id_idx"
ON "RentalRequestActivity"("rentalRequestId", "createdAt", "id");
CREATE INDEX "RentalRequestActivity_actorUserId_createdAt_id_idx"
ON "RentalRequestActivity"("actorUserId", "createdAt", "id");
CREATE INDEX "RentalRequestActivity_previousAssigneeUserId_idx"
ON "RentalRequestActivity"("previousAssigneeUserId");
CREATE INDEX "RentalRequestActivity_newAssigneeUserId_idx"
ON "RentalRequestActivity"("newAssigneeUserId");

ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_rentalRequestId_fkey"
FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_previousAssigneeUserId_fkey"
FOREIGN KEY ("previousAssigneeUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_newAssigneeUserId_fkey"
FOREIGN KEY ("newAssigneeUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "RentalRequestInternalNote"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_rental_request_review_history() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rental request review history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RentalRequestInternalNote_immutable_update"
BEFORE UPDATE ON "RentalRequestInternalNote"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_review_history();
CREATE TRIGGER "RentalRequestInternalNote_immutable_delete"
BEFORE DELETE ON "RentalRequestInternalNote"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_review_history();
CREATE TRIGGER "RentalRequestActivity_immutable_update"
BEFORE UPDATE ON "RentalRequestActivity"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_review_history();
CREATE TRIGGER "RentalRequestActivity_immutable_delete"
BEFORE DELETE ON "RentalRequestActivity"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_review_history();
