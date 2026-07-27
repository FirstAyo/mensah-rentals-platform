CREATE FUNCTION protect_terminal_rental_request() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED')
    AND (
      OLD."status" IS DISTINCT FROM NEW."status"
      OR OLD."reviewVersion" IS DISTINCT FROM NEW."reviewVersion"
      OR OLD."reviewStartedAt" IS DISTINCT FROM NEW."reviewStartedAt"
      OR OLD."assignedToUserId" IS DISTINCT FROM NEW."assignedToUserId"
      OR OLD."assignedAt" IS DISTINCT FROM NEW."assignedAt"
    )
  THEN
    RAISE EXCEPTION 'Terminal rental request review fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RentalRequest_terminal_review_immutable"
BEFORE UPDATE ON "RentalRequest"
FOR EACH ROW EXECUTE FUNCTION protect_terminal_rental_request();

CREATE OR REPLACE FUNCTION validate_rental_request_decision_consistency() RETURNS trigger AS $$
DECLARE
  request_id TEXT;
  request_status TEXT;
  request_review_version INTEGER;
  decision_outcome TEXT;
  decision_id TEXT;
  decision_review_version INTEGER;
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

  SELECT "status"::TEXT, "reviewVersion"
  INTO request_status, request_review_version
  FROM "RentalRequest" WHERE "id" = request_id;
  SELECT "id", "outcome"::TEXT, "reviewVersionAfter"
  INTO decision_id, decision_outcome, decision_review_version
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
  IF request_review_version IS DISTINCT FROM decision_review_version THEN
    RAISE EXCEPTION 'Terminal rental request version must match its decision';
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
