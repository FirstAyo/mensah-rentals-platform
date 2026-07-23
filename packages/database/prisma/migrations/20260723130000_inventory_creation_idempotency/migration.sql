ALTER TABLE "Inventory" ADD COLUMN "creationOperationId" TEXT;

CREATE UNIQUE INDEX "Inventory_creationOperationId_key"
ON "Inventory"("creationOperationId");
