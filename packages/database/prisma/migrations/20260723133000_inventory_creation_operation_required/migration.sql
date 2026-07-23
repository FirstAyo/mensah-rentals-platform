ALTER TABLE "Inventory"
ADD COLUMN "creationReason" TEXT NOT NULL DEFAULT 'Legacy inventory definition',
ADD COLUMN "initialState" "InventoryState" NOT NULL DEFAULT 'RENTABLE';

UPDATE "Inventory"
SET "creationOperationId" = 'legacy-' || "id"
WHERE "creationOperationId" IS NULL;

ALTER TABLE "Inventory"
ALTER COLUMN "creationOperationId" SET NOT NULL,
ALTER COLUMN "creationReason" DROP DEFAULT,
ALTER COLUMN "initialState" DROP DEFAULT;
