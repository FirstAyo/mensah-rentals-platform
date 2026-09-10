-- Phase 19.1 adds optional administrative metadata without rewriting existing
-- commercial, inventory, reservation, or fulfilment history.
ALTER TYPE "RentalOrderActivityType" ADD VALUE 'ORDER_ASSIGNED';
ALTER TYPE "RentalOrderActivityType" ADD VALUE 'ORDER_REASSIGNED';
ALTER TYPE "RentalOrderActivityType" ADD VALUE 'ORDER_UNASSIGNED';
ALTER TYPE "InventoryAdjustmentReasonType" ADD VALUE 'LOST';

ALTER TABLE "Product"
ADD COLUMN "defaultUnitPriceCents" BIGINT;

ALTER TABLE "RentalOrder"
ADD COLUMN "assignedToUserId" TEXT,
ADD COLUMN "assignedAt" TIMESTAMPTZ(3),
ADD COLUMN "assignmentVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RentalOrderActivity"
ADD COLUMN "previousAssigneeUserId" TEXT,
ADD COLUMN "newAssigneeUserId" TEXT;

ALTER TABLE "FulfilmentHandoff"
ADD COLUMN "recipientCompany" TEXT;

CREATE INDEX "RentalOrder_assignedToUserId_confirmedAt_id_idx"
ON "RentalOrder"("assignedToUserId", "confirmedAt", "id");

CREATE INDEX "RentalOrderActivity_previousAssigneeUserId_createdAt_id_idx"
ON "RentalOrderActivity"("previousAssigneeUserId", "createdAt", "id");

CREATE INDEX "RentalOrderActivity_newAssigneeUserId_createdAt_id_idx"
ON "RentalOrderActivity"("newAssigneeUserId", "createdAt", "id");

ALTER TABLE "RentalOrder"
ADD CONSTRAINT "RentalOrder_assignedToUserId_fkey"
FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalOrderActivity"
ADD CONSTRAINT "RentalOrderActivity_previousAssigneeUserId_fkey"
FOREIGN KEY ("previousAssigneeUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalOrderActivity"
ADD CONSTRAINT "RentalOrderActivity_newAssigneeUserId_fkey"
FOREIGN KEY ("newAssigneeUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_defaultUnitPriceCents_check"
CHECK (
  "defaultUnitPriceCents" IS NULL
  OR ("defaultUnitPriceCents" >= 0 AND "defaultUnitPriceCents" <= 100000000)
);
