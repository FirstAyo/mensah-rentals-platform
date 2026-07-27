CREATE TYPE "RentalRequestDecisionOutcome" AS ENUM (
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED'
);

CREATE TABLE "RentalRequestDecision" (
  "id" TEXT NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "outcome" "RentalRequestDecisionOutcome" NOT NULL,
  "decidedByUserId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "internalReason" TEXT NOT NULL,
  "customerExplanation" TEXT,
  "reviewVersionBefore" INTEGER NOT NULL,
  "reviewVersionAfter" INTEGER NOT NULL,
  "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestDecision_operationId_check" CHECK (
    "operationId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "RentalRequestDecision_payloadHash_check" CHECK (
    "payloadHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "RentalRequestDecision_reason_check" CHECK (
    length(trim("internalReason")) BETWEEN 1 AND 3000
  ),
  CONSTRAINT "RentalRequestDecision_customerExplanation_check" CHECK (
    "customerExplanation" IS NULL OR
    length(trim("customerExplanation")) BETWEEN 1 AND 2000
  ),
  CONSTRAINT "RentalRequestDecision_explanation_required_check" CHECK (
    "outcome" = 'APPROVED' OR "customerExplanation" IS NOT NULL
  ),
  CONSTRAINT "RentalRequestDecision_version_check" CHECK (
    "reviewVersionBefore" >= 0 AND
    "reviewVersionAfter" = "reviewVersionBefore" + 1
  )
);

CREATE TABLE "RentalRequestDecisionItem" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "rentalRequestItemId" TEXT NOT NULL,
  "requestedQuantitySnapshot" INTEGER NOT NULL,
  "approvedQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestDecisionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestDecisionItem_quantity_check" CHECK (
    "requestedQuantitySnapshot" BETWEEN 1 AND 1000 AND
    "approvedQuantity" BETWEEN 0 AND "requestedQuantitySnapshot"
  )
);

CREATE UNIQUE INDEX "RentalRequestDecision_rentalRequestId_key"
ON "RentalRequestDecision"("rentalRequestId");
CREATE UNIQUE INDEX "RentalRequestDecision_operationId_key"
ON "RentalRequestDecision"("operationId");
CREATE INDEX "RentalRequestDecision_decidedByUserId_decidedAt_id_idx"
ON "RentalRequestDecision"("decidedByUserId", "decidedAt", "id");
CREATE INDEX "RentalRequestDecision_outcome_decidedAt_id_idx"
ON "RentalRequestDecision"("outcome", "decidedAt", "id");

CREATE UNIQUE INDEX "RentalRequestDecisionItem_rentalRequestItemId_key"
ON "RentalRequestDecisionItem"("rentalRequestItemId");
CREATE UNIQUE INDEX "RentalRequestDecisionItem_decisionId_rentalRequestItemId_key"
ON "RentalRequestDecisionItem"("decisionId", "rentalRequestItemId");
CREATE INDEX "RentalRequestDecisionItem_decisionId_createdAt_id_idx"
ON "RentalRequestDecisionItem"("decisionId", "createdAt", "id");

ALTER TABLE "RentalRequestDecision"
ADD CONSTRAINT "RentalRequestDecision_rentalRequestId_fkey"
FOREIGN KEY ("rentalRequestId") REFERENCES "RentalRequest"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestDecision"
ADD CONSTRAINT "RentalRequestDecision_decidedByUserId_fkey"
FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestDecisionItem"
ADD CONSTRAINT "RentalRequestDecisionItem_decisionId_fkey"
FOREIGN KEY ("decisionId") REFERENCES "RentalRequestDecision"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequestDecisionItem"
ADD CONSTRAINT "RentalRequestDecisionItem_rentalRequestItemId_fkey"
FOREIGN KEY ("rentalRequestItemId") REFERENCES "RentalRequestItem"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalRequestActivity" ADD COLUMN "decisionId" TEXT;
CREATE UNIQUE INDEX "RentalRequestActivity_decisionId_key"
ON "RentalRequestActivity"("decisionId");
ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_decisionId_fkey"
FOREIGN KEY ("decisionId") REFERENCES "RentalRequestDecision"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalRequest" DROP CONSTRAINT "RentalRequest_review_state_check";
ALTER TABLE "RentalRequest"
ADD CONSTRAINT "RentalRequest_review_state_check" CHECK (
  ("status" = 'SUBMITTED' AND "reviewStartedAt" IS NULL)
  OR ("status" IN ('UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED') AND "reviewStartedAt" IS NOT NULL)
);

ALTER TABLE "RentalRequestActivity"
DROP CONSTRAINT "RentalRequestActivity_shape_check";
ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_shape_check" CHECK (
  ("type" = 'ASSIGNED' AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NOT NULL AND "noteId" IS NULL AND "decisionId" IS NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'REASSIGNED' AND "previousAssigneeUserId" IS NOT NULL AND "newAssigneeUserId" IS NOT NULL AND "previousAssigneeUserId" <> "newAssigneeUserId" AND "noteId" IS NULL AND "decisionId" IS NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'UNASSIGNED' AND "previousAssigneeUserId" IS NOT NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NULL AND "decisionId" IS NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'NOTE_ADDED' AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NOT NULL AND "decisionId" IS NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'REVIEW_STARTED' AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NULL AND "decisionId" IS NULL AND "previousStatus" = 'SUBMITTED' AND "newStatus" = 'UNDER_REVIEW')
  OR ("type" = 'APPROVED' AND "actorUserId" IS NOT NULL AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NULL AND "decisionId" IS NOT NULL AND "previousStatus" = 'UNDER_REVIEW' AND "newStatus" = 'APPROVED')
  OR ("type" = 'PARTIALLY_APPROVED' AND "actorUserId" IS NOT NULL AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NULL AND "decisionId" IS NOT NULL AND "previousStatus" = 'UNDER_REVIEW' AND "newStatus" = 'PARTIALLY_APPROVED')
  OR ("type" = 'REJECTED' AND "actorUserId" IS NOT NULL AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NULL AND "decisionId" IS NOT NULL AND "previousStatus" = 'UNDER_REVIEW' AND "newStatus" = 'REJECTED')
);

CREATE FUNCTION protect_rental_request_decision_history() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rental request decisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RentalRequestDecision_immutable_update"
BEFORE UPDATE ON "RentalRequestDecision"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_decision_history();
CREATE TRIGGER "RentalRequestDecision_immutable_delete"
BEFORE DELETE ON "RentalRequestDecision"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_decision_history();
CREATE TRIGGER "RentalRequestDecisionItem_immutable_update"
BEFORE UPDATE ON "RentalRequestDecisionItem"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_decision_history();
CREATE TRIGGER "RentalRequestDecisionItem_immutable_delete"
BEFORE DELETE ON "RentalRequestDecisionItem"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_decision_history();

CREATE FUNCTION validate_rental_request_decision_item() RETURNS trigger AS $$
DECLARE
  decision_request_id TEXT;
  item_request_id TEXT;
  item_requested_quantity INTEGER;
BEGIN
  SELECT "rentalRequestId" INTO decision_request_id
  FROM "RentalRequestDecision" WHERE "id" = NEW."decisionId";
  SELECT "rentalRequestId", "requestedQuantity"
  INTO item_request_id, item_requested_quantity
  FROM "RentalRequestItem" WHERE "id" = NEW."rentalRequestItemId";

  IF decision_request_id IS NULL OR item_request_id IS NULL
    OR decision_request_id <> item_request_id
  THEN
    RAISE EXCEPTION 'Decision items must belong to the decided rental request';
  END IF;
  IF NEW."requestedQuantitySnapshot" <> item_requested_quantity THEN
    RAISE EXCEPTION 'Decision quantity snapshot must match the original request';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RentalRequestDecisionItem_validate_insert"
BEFORE INSERT ON "RentalRequestDecisionItem"
FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_item();

CREATE FUNCTION enforce_rental_request_status_transition() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS NOT DISTINCT FROM NEW."status" THEN
    RETURN NEW;
  END IF;
  IF (OLD."status" = 'SUBMITTED' AND NEW."status" = 'UNDER_REVIEW')
    OR (OLD."status" = 'UNDER_REVIEW' AND NEW."status" IN ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'))
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid rental request status transition';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RentalRequest_status_transition"
BEFORE UPDATE OF "status" ON "RentalRequest"
FOR EACH ROW EXECUTE FUNCTION enforce_rental_request_status_transition();

CREATE FUNCTION validate_rental_request_decision_consistency() RETURNS trigger AS $$
DECLARE
  request_id TEXT;
  request_status TEXT;
  decision_outcome TEXT;
  decision_id TEXT;
  request_item_count INTEGER;
  decision_item_count INTEGER;
  invalid_item_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'RentalRequest' THEN
    request_id := NEW."id";
  ELSIF TG_TABLE_NAME = 'RentalRequestDecision' THEN
    request_id := NEW."rentalRequestId";
  ELSE
    SELECT "rentalRequestId" INTO request_id
    FROM "RentalRequestDecision" WHERE "id" = NEW."decisionId";
  END IF;

  SELECT "status"::TEXT INTO request_status
  FROM "RentalRequest" WHERE "id" = request_id;
  SELECT "id", "outcome"::TEXT INTO decision_id, decision_outcome
  FROM "RentalRequestDecision" WHERE "rentalRequestId" = request_id;

  IF request_status IN ('SUBMITTED', 'UNDER_REVIEW') THEN
    IF decision_id IS NOT NULL THEN
      RAISE EXCEPTION 'A nonterminal rental request cannot have a decision';
    END IF;
    RETURN NULL;
  END IF;

  IF decision_id IS NULL OR decision_outcome IS DISTINCT FROM request_status THEN
    RAISE EXCEPTION 'Terminal rental request status must match its decision';
  END IF;

  SELECT count(*) INTO request_item_count
  FROM "RentalRequestItem" WHERE "rentalRequestId" = request_id;
  SELECT count(*) INTO decision_item_count
  FROM "RentalRequestDecisionItem" WHERE "decisionId" = decision_id;
  IF request_item_count = 0 OR decision_item_count <> request_item_count THEN
    RAISE EXCEPTION 'Every requested item requires one decision item';
  END IF;

  SELECT count(*) INTO invalid_item_count
  FROM "RentalRequestDecisionItem"
  WHERE "decisionId" = decision_id
    AND (
      (decision_outcome = 'APPROVED' AND "approvedQuantity" <> "requestedQuantitySnapshot")
      OR (decision_outcome = 'REJECTED' AND "approvedQuantity" <> 0)
    );
  IF invalid_item_count > 0 THEN
    RAISE EXCEPTION 'Decision item quantities do not match the outcome';
  END IF;

  IF decision_outcome = 'PARTIALLY_APPROVED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "RentalRequestDecisionItem"
      WHERE "decisionId" = decision_id
        AND "approvedQuantity" <> "requestedQuantitySnapshot"
    ) OR NOT EXISTS (
      SELECT 1 FROM "RentalRequestDecisionItem"
      WHERE "decisionId" = decision_id AND "approvedQuantity" > 0
    ) THEN
      RAISE EXCEPTION 'Partial approval requires a changed and positive line';
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "RentalRequest_decision_consistency"
AFTER INSERT OR UPDATE ON "RentalRequest"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_consistency();
CREATE CONSTRAINT TRIGGER "RentalRequestDecision_consistency"
AFTER INSERT ON "RentalRequestDecision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_consistency();
CREATE CONSTRAINT TRIGGER "RentalRequestDecisionItem_consistency"
AFTER INSERT ON "RentalRequestDecisionItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_rental_request_decision_consistency();
