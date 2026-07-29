CREATE TYPE "InventoryTransactionAction" AS ENUM (
  'INITIAL_STOCK','MANUAL_ADJUSTMENT','ASSET_CREATED','CHECKOUT',
  'RETURN_TO_RENTABLE','RETURN_TO_DAMAGED','RETURN_TO_MAINTENANCE','MARK_MISSING',
  'RECOVER_MISSING_TO_RENTABLE','RECOVER_MISSING_TO_DAMAGED',
  'RECOVER_MISSING_TO_MAINTENANCE','REPAIR_COMPLETE','WRITE_OFF'
);
CREATE TYPE "RentalReturnStatus" AS ENUM ('PARTIALLY_RETURNED','RECONCILIATION_REQUIRED','READY_TO_COMPLETE','COMPLETED');
CREATE TYPE "RentalReturnDisposition" AS ENUM ('RENTABLE','DAMAGED','MAINTENANCE','MISSING');
CREATE TYPE "RentalIssueType" AS ENUM ('MISSING','DAMAGED','MAINTENANCE_REQUIRED','LATE_RETURN','WRONG_ITEM_RETURNED','UNRESOLVED_QUANTITY');
CREATE TYPE "RentalIssueStatus" AS ENUM ('OPEN','UNDER_REVIEW','CUSTOMER_CONTACTED','AWAITING_ITEM_RETURN','AWAITING_INSPECTION','AWAITING_REPAIR','AWAITING_PAYMENT','RESOLVED');
CREATE TYPE "RentalIssueResolutionOutcome" AS ENUM ('ITEM_RETURNED','REPAIRED','PAID','WAIVED','WRITTEN_OFF','REPLACED','OTHER');
CREATE TYPE "ReturnActivityType" AS ENUM ('RETURN_RECORDED','RECONCILIATION_REQUESTED','RECONCILED','COMPLETED','ISSUE_CREATED','ISSUE_UPDATED','ISSUE_RESOLVED','ITEM_RECOVERED');

ALTER TYPE "InventoryState" ADD VALUE 'MISSING';
ALTER TYPE "ActiveRentalStatus" ADD VALUE 'PARTIALLY_RETURNED';
ALTER TYPE "ActiveRentalStatus" ADD VALUE 'AWAITING_RECONCILIATION';
ALTER TYPE "ActiveRentalStatus" ADD VALUE 'COMPLETED';

ALTER TABLE "ActiveRentalSerializedAsset"
  DROP CONSTRAINT "ActiveRentalSerializedAsset_inventoryItemId_key";
CREATE UNIQUE INDEX "ActiveRentalSerializedAsset_activeRentalItemId_inventoryIte_key"
  ON "ActiveRentalSerializedAsset"("activeRentalItemId", "inventoryItemId");
CREATE INDEX "ActiveRentalSerializedAsset_inventoryItemId_checkedOutAt_id_idx"
  ON "ActiveRentalSerializedAsset"("inventoryItemId", "checkedOutAt", "id");

ALTER TABLE "InventoryTransaction"
  ADD COLUMN "action" "InventoryTransactionAction" NOT NULL DEFAULT 'MANUAL_ADJUSTMENT',
  ADD COLUMN "returnOperationItemId" TEXT,
  ADD COLUMN "issueResolutionId" TEXT;
-- Existing inventory history is append-only at runtime. Temporarily remove only
-- the UPDATE protection while this migration classifies legacy rows, then restore
-- it immediately. The DELETE protection remains active throughout.
DROP TRIGGER "InventoryTransaction_append_only_update" ON "InventoryTransaction";
UPDATE "InventoryTransaction" SET "action" = CASE
  WHEN "kind" = 'INITIAL_STOCK' THEN 'INITIAL_STOCK'::"InventoryTransactionAction"
  WHEN "kind" = 'SERIALIZED_ITEM_CREATED' THEN 'ASSET_CREATED'::"InventoryTransactionAction"
  WHEN "fulfilmentOperationId" IS NOT NULL THEN 'CHECKOUT'::"InventoryTransactionAction"
  ELSE 'MANUAL_ADJUSTMENT'::"InventoryTransactionAction" END;
CREATE TRIGGER "InventoryTransaction_append_only_update"
  BEFORE UPDATE ON "InventoryTransaction"
  FOR EACH ROW EXECUTE FUNCTION protect_inventory_transaction();

CREATE TABLE "RentalReturn" (
  "id" TEXT PRIMARY KEY, "activeRentalId" TEXT NOT NULL UNIQUE,
  "returnNumber" TEXT NOT NULL UNIQUE, "status" "RentalReturnStatus" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0, "firstReturnAt" TIMESTAMPTZ(3) NOT NULL,
  "fullyAccountedAt" TIMESTAMPTZ(3), "reconciledAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3), "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL, "completedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RentalReturn_version_check" CHECK ("version" >= 0),
  CONSTRAINT "RentalReturn_activeRentalId_fkey" FOREIGN KEY ("activeRentalId") REFERENCES "ActiveRental"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturn_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturn_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturn_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RentalReturn_status_updatedAt_id_idx" ON "RentalReturn"("status","updatedAt","id");
CREATE INDEX "RentalReturn_completedAt_id_idx" ON "RentalReturn"("completedAt","id");

CREATE TABLE "RentalReturnItem" (
  "id" TEXT PRIMARY KEY, "rentalReturnId" TEXT NOT NULL,
  "activeRentalItemId" TEXT NOT NULL UNIQUE, "expectedCheckedOutQuantity" INTEGER NOT NULL,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0, "rentableQuantity" INTEGER NOT NULL DEFAULT 0,
  "damagedQuantity" INTEGER NOT NULL DEFAULT 0, "maintenanceQuantity" INTEGER NOT NULL DEFAULT 0,
  "missingQuantity" INTEGER NOT NULL DEFAULT 0, "outstandingQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RentalReturnItem_return_fkey" FOREIGN KEY ("rentalReturnId") REFERENCES "RentalReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturnItem_active_fkey" FOREIGN KEY ("activeRentalItemId") REFERENCES "ActiveRentalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturnItem_quantities_check" CHECK (
    "expectedCheckedOutQuantity" > 0 AND "receivedQuantity" >= 0 AND "rentableQuantity" >= 0
    AND "damagedQuantity" >= 0 AND "maintenanceQuantity" >= 0 AND "missingQuantity" >= 0
    AND "outstandingQuantity" >= 0
    AND "receivedQuantity" = "rentableQuantity" + "damagedQuantity" + "maintenanceQuantity"
    AND "expectedCheckedOutQuantity" = "receivedQuantity" + "missingQuantity" + "outstandingQuantity"
  ), UNIQUE ("rentalReturnId","activeRentalItemId")
);
CREATE INDEX "RentalReturnItem_rentalReturnId_id_idx" ON "RentalReturnItem"("rentalReturnId","id");

CREATE TABLE "RentalReturnOperation" (
  "id" TEXT PRIMARY KEY, "rentalReturnId" TEXT NOT NULL, "operationId" UUID NOT NULL UNIQUE,
  "payloadHash" CHAR(64) NOT NULL, "actorUserId" TEXT NOT NULL, "expectedVersion" INTEGER NOT NULL,
  "resultingVersion" INTEGER NOT NULL, "receivedAt" TIMESTAMPTZ(3) NOT NULL,
  "internalNotes" TEXT, "customerSafeNotes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalReturnOperation_version_check" CHECK ("expectedVersion" >= 0 AND "resultingVersion" = "expectedVersion" + 1),
  CONSTRAINT "RentalReturnOperation_return_fkey" FOREIGN KEY ("rentalReturnId") REFERENCES "RentalReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturnOperation_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RentalReturnOperation_return_created_idx" ON "RentalReturnOperation"("rentalReturnId","createdAt","id");
CREATE INDEX "RentalReturnOperation_actor_created_idx" ON "RentalReturnOperation"("actorUserId","createdAt","id");

CREATE TABLE "RentalReturnOperationItem" (
  "id" TEXT PRIMARY KEY, "returnOperationId" TEXT NOT NULL, "rentalReturnItemId" TEXT NOT NULL,
  "quantityReceived" INTEGER NOT NULL DEFAULT 0, "quantityRentable" INTEGER NOT NULL DEFAULT 0,
  "quantityDamaged" INTEGER NOT NULL DEFAULT 0, "quantityMaintenance" INTEGER NOT NULL DEFAULT 0,
  "quantityMissing" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalReturnOperationItem_operation_fkey" FOREIGN KEY ("returnOperationId") REFERENCES "RentalReturnOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturnOperationItem_item_fkey" FOREIGN KEY ("rentalReturnItemId") REFERENCES "RentalReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalReturnOperationItem_quantities_check" CHECK (
    "quantityReceived" >= 0 AND "quantityRentable" >= 0 AND "quantityDamaged" >= 0
    AND "quantityMaintenance" >= 0 AND "quantityMissing" >= 0
    AND "quantityReceived" = "quantityRentable" + "quantityDamaged" + "quantityMaintenance"
    AND "quantityReceived" + "quantityMissing" > 0
  ), UNIQUE ("returnOperationId","rentalReturnItemId")
);
CREATE INDEX "RentalReturnOperationItem_item_created_idx" ON "RentalReturnOperationItem"("rentalReturnItemId","createdAt","id");

CREATE TABLE "ReturnedSerializedAsset" (
  "id" TEXT PRIMARY KEY, "returnOperationItemId" TEXT NOT NULL,
  "activeRentalSerializedAssetId" TEXT NOT NULL UNIQUE, "inventoryItemId" TEXT NOT NULL,
  "disposition" "RentalReturnDisposition" NOT NULL, "inspectionNotes" TEXT,
  "receivedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnedSerializedAsset_missing_time_check" CHECK (("disposition" = 'MISSING' AND "receivedAt" IS NULL) OR ("disposition" <> 'MISSING' AND "receivedAt" IS NOT NULL)),
  CONSTRAINT "ReturnedSerializedAsset_operation_item_fkey" FOREIGN KEY ("returnOperationItemId") REFERENCES "RentalReturnOperationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReturnedSerializedAsset_active_asset_fkey" FOREIGN KEY ("activeRentalSerializedAssetId") REFERENCES "ActiveRentalSerializedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReturnedSerializedAsset_inventory_item_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReturnedSerializedAsset_operation_idx" ON "ReturnedSerializedAsset"("returnOperationItemId","id");
CREATE INDEX "ReturnedSerializedAsset_inventory_received_idx" ON "ReturnedSerializedAsset"("inventoryItemId","receivedAt","id");

CREATE TABLE "RentalIssue" (
  "id" TEXT PRIMARY KEY, "rentalReturnId" TEXT NOT NULL, "rentalReturnItemId" TEXT,
  "sourceReturnOperationItemId" TEXT, "returnedSerializedAssetId" TEXT, "inventoryItemId" TEXT,
  "type" "RentalIssueType" NOT NULL, "status" "RentalIssueStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 0, "quantity" INTEGER NOT NULL, "openQuantity" INTEGER NOT NULL,
  "blocksCompletion" BOOLEAN NOT NULL DEFAULT TRUE, "internalDescription" TEXT NOT NULL,
  "customerSafeDescription" TEXT, "amountAssessedCents" BIGINT NOT NULL DEFAULT 0,
  "amountPaidCents" BIGINT NOT NULL DEFAULT 0, "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RentalIssue_values_check" CHECK ("version" >= 0 AND "quantity" > 0 AND "openQuantity" >= 0 AND "openQuantity" <= "quantity" AND "amountAssessedCents" >= 0 AND "amountPaidCents" >= 0),
  CONSTRAINT "RentalIssue_return_fkey" FOREIGN KEY ("rentalReturnId") REFERENCES "RentalReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalIssue_return_item_fkey" FOREIGN KEY ("rentalReturnItemId") REFERENCES "RentalReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalIssue_source_item_fkey" FOREIGN KEY ("sourceReturnOperationItemId") REFERENCES "RentalReturnOperationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalIssue_returned_asset_fkey" FOREIGN KEY ("returnedSerializedAssetId") REFERENCES "ReturnedSerializedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalIssue_inventory_item_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalIssue_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RentalIssue_return_status_type_idx" ON "RentalIssue"("rentalReturnId","status","type","id");
CREATE INDEX "RentalIssue_item_status_idx" ON "RentalIssue"("rentalReturnItemId","status","id");
CREATE INDEX "RentalIssue_inventory_status_idx" ON "RentalIssue"("inventoryItemId","status","id");
CREATE INDEX "RentalIssue_type_status_created_idx" ON "RentalIssue"("type","status","createdAt","id");
CREATE UNIQUE INDEX "RentalIssue_bulk_source_type_key" ON "RentalIssue"("sourceReturnOperationItemId","type") WHERE "sourceReturnOperationItemId" IS NOT NULL AND "returnedSerializedAssetId" IS NULL;
CREATE UNIQUE INDEX "RentalIssue_serial_source_type_key" ON "RentalIssue"("returnedSerializedAssetId","type") WHERE "returnedSerializedAssetId" IS NOT NULL;

CREATE TABLE "RentalIssueResolution" (
  "id" TEXT PRIMARY KEY, "rentalIssueId" TEXT NOT NULL, "operationId" UUID NOT NULL UNIQUE,
  "payloadHash" CHAR(64) NOT NULL, "expectedVersion" INTEGER NOT NULL, "resultingVersion" INTEGER NOT NULL,
  "actorUserId" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "outcome" "RentalIssueResolutionOutcome" NOT NULL,
  "resultingInventoryState" "InventoryState", "assessedCentsDelta" BIGINT NOT NULL DEFAULT 0,
  "paidCentsDelta" BIGINT NOT NULL DEFAULT 0, "internalReason" TEXT NOT NULL, "customerSafeNote" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalIssueResolution_values_check" CHECK ("expectedVersion" >= 0 AND "resultingVersion" = "expectedVersion" + 1 AND "quantity" >= 0 AND "assessedCentsDelta" >= 0 AND "paidCentsDelta" >= 0),
  CONSTRAINT "RentalIssueResolution_issue_fkey" FOREIGN KEY ("rentalIssueId") REFERENCES "RentalIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalIssueResolution_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RentalIssueResolution_issue_created_idx" ON "RentalIssueResolution"("rentalIssueId","createdAt","id");
CREATE INDEX "RentalIssueResolution_actor_created_idx" ON "RentalIssueResolution"("actorUserId","createdAt","id");

CREATE TABLE "ReturnActivity" (
  "id" TEXT PRIMARY KEY, "rentalReturnId" TEXT NOT NULL, "type" "ReturnActivityType" NOT NULL,
  "actorUserId" TEXT NOT NULL, "summary" TEXT NOT NULL, "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnActivity_return_fkey" FOREIGN KEY ("rentalReturnId") REFERENCES "RentalReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReturnActivity_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReturnActivity_return_created_idx" ON "ReturnActivity"("rentalReturnId","createdAt","id");
CREATE INDEX "ReturnActivity_actor_created_idx" ON "ReturnActivity"("actorUserId","createdAt","id");

ALTER TABLE "InventoryTransaction"
  ADD CONSTRAINT "InventoryTransaction_return_item_fkey" FOREIGN KEY ("returnOperationItemId") REFERENCES "RentalReturnOperationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransaction_issue_resolution_fkey" FOREIGN KEY ("issueResolutionId") REFERENCES "RentalIssueResolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InventoryTransaction_return_item_idx" ON "InventoryTransaction"("returnOperationItemId","createdAt","id");
CREATE INDEX "InventoryTransaction_issue_resolution_idx" ON "InventoryTransaction"("issueResolutionId","createdAt","id");
CREATE UNIQUE INDEX "InventoryTransaction_return_destination_key" ON "InventoryTransaction"("returnOperationItemId","toState") WHERE "returnOperationItemId" IS NOT NULL;
CREATE UNIQUE INDEX "InventoryTransaction_resolution_destination_key" ON "InventoryTransaction"("issueResolutionId","toState") WHERE "issueResolutionId" IS NOT NULL;

CREATE FUNCTION prevent_phase16_history_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END;
$$ LANGUAGE plpgsql;
DO $$ DECLARE n TEXT; BEGIN FOREACH n IN ARRAY ARRAY['RentalReturnOperation','RentalReturnOperationItem','ReturnedSerializedAsset','RentalIssueResolution','ReturnActivity'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_phase16_history_mutation()', n || '_append_only', n);
END LOOP; END $$;

CREATE FUNCTION validate_phase16_return_identity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RentalReturnItem" ri JOIN "RentalReturn" r ON r."id"=ri."rentalReturnId"
    JOIN "ActiveRentalItem" ai ON ai."id"=ri."activeRentalItemId"
    WHERE ai."activeRentalId"<>r."activeRentalId" OR ri."expectedCheckedOutQuantity"<>ai."checkedOutQuantity"
  ) THEN RAISE EXCEPTION 'Return item must snapshot its active rental item'; END IF;
  IF EXISTS (
    SELECT 1 FROM "RentalReturnOperationItem" oi JOIN "RentalReturnOperation" o ON o."id"=oi."returnOperationId"
    JOIN "RentalReturnItem" ri ON ri."id"=oi."rentalReturnItemId" WHERE ri."rentalReturnId"<>o."rentalReturnId"
  ) THEN RAISE EXCEPTION 'Return operation item must belong to the same return'; END IF;
  IF EXISTS (
    SELECT 1 FROM "ReturnedSerializedAsset" rsa
    JOIN "RentalReturnOperationItem" oi ON oi."id"=rsa."returnOperationItemId"
    JOIN "RentalReturnItem" ri ON ri."id"=oi."rentalReturnItemId"
    JOIN "ActiveRentalSerializedAsset" asa ON asa."id"=rsa."activeRentalSerializedAssetId"
    WHERE asa."activeRentalItemId"<>ri."activeRentalItemId" OR asa."inventoryItemId"<>rsa."inventoryItemId"
  ) THEN RAISE EXCEPTION 'Returned serialized asset must match its checkout occurrence'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DO $$ DECLARE n TEXT; BEGIN FOREACH n IN ARRAY ARRAY['RentalReturn','RentalReturnItem','RentalReturnOperation','RentalReturnOperationItem','ReturnedSerializedAsset'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_phase16_return_identity()', n || '_identity_guard', n);
END LOOP; END $$;

CREATE FUNCTION freeze_active_rental_item_after_return() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RentalReturn" WHERE "activeRentalId"=NEW."activeRentalId") THEN
    RAISE EXCEPTION 'Checkout set is frozen after return intake starts';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION freeze_serialized_checkout_after_return() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ActiveRentalItem" ai
    JOIN "RentalReturn" r ON r."activeRentalId"=ai."activeRentalId"
    WHERE ai."id"=NEW."activeRentalItemId"
  ) THEN
    RAISE EXCEPTION 'Checkout set is frozen after return intake starts';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ActiveRentalItem_return_freeze" BEFORE UPDATE OF "checkedOutQuantity" ON "ActiveRentalItem" FOR EACH ROW WHEN (NEW."checkedOutQuantity"<>OLD."checkedOutQuantity") EXECUTE FUNCTION freeze_active_rental_item_after_return();
CREATE TRIGGER "ActiveRentalSerializedAsset_return_freeze" BEFORE INSERT ON "ActiveRentalSerializedAsset" FOR EACH ROW EXECUTE FUNCTION freeze_serialized_checkout_after_return();
