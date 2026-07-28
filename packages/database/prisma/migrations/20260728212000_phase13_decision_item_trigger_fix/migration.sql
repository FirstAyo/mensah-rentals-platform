-- RentalRequestDecision rows permit only the explicit one-way supersession
-- update. Decision item rows remain fully append-only and therefore require a
-- table-specific trigger function that does not inspect decision-only columns.
CREATE OR REPLACE FUNCTION protect_rental_request_decision_item_history()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rental request decision items are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "RentalRequestDecisionItem_immutable_update"
ON "RentalRequestDecisionItem";

CREATE TRIGGER "RentalRequestDecisionItem_immutable_update"
BEFORE UPDATE ON "RentalRequestDecisionItem"
FOR EACH ROW EXECUTE FUNCTION protect_rental_request_decision_item_history();

-- Re-review-required is an awaiting-review state, so it intentionally has no
-- reviewStartedAt timestamp until a staff member begins the new cycle.
ALTER TABLE "RentalRequest"
DROP CONSTRAINT IF EXISTS "RentalRequest_review_state_check";

ALTER TABLE "RentalRequest"
ADD CONSTRAINT "RentalRequest_review_state_check" CHECK (
  ("status" IN ('SUBMITTED', 'RE_REVIEW_REQUIRED') AND "reviewStartedAt" IS NULL)
  OR (
    "status" IN ('UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED')
    AND "reviewStartedAt" IS NOT NULL
  )
);
