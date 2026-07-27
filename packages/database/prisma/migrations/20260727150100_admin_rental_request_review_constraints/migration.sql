ALTER TABLE "RentalRequest"
ADD CONSTRAINT "RentalRequest_review_state_check" CHECK (
  ("status" = 'SUBMITTED' AND "reviewStartedAt" IS NULL)
  OR ("status" = 'UNDER_REVIEW' AND "reviewStartedAt" IS NOT NULL)
);

ALTER TABLE "RentalRequestActivity"
ADD CONSTRAINT "RentalRequestActivity_shape_check" CHECK (
  ("type" = 'ASSIGNED' AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NOT NULL AND "noteId" IS NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'REASSIGNED' AND "previousAssigneeUserId" IS NOT NULL AND "newAssigneeUserId" IS NOT NULL AND "previousAssigneeUserId" <> "newAssigneeUserId" AND "noteId" IS NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'UNASSIGNED' AND "previousAssigneeUserId" IS NOT NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'NOTE_ADDED' AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NOT NULL AND "previousStatus" IS NULL AND "newStatus" IS NULL)
  OR ("type" = 'REVIEW_STARTED' AND "previousAssigneeUserId" IS NULL AND "newAssigneeUserId" IS NULL AND "noteId" IS NULL AND "previousStatus" = 'SUBMITTED' AND "newStatus" = 'UNDER_REVIEW')
);
