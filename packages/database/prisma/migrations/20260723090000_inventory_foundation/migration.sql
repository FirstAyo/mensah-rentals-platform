CREATE TYPE "InventoryTrackingMode" AS ENUM ('BULK', 'SERIALIZED');
CREATE TYPE "InventoryState" AS ENUM ('RENTABLE', 'RENTED', 'MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED');
CREATE TYPE "InventoryTransactionKind" AS ENUM ('INITIAL_STOCK', 'BULK_MOVEMENT', 'SERIALIZED_ITEM_CREATED', 'SERIALIZED_ITEM_STATE_CHANGED');

CREATE TABLE "Inventory" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "trackingMode" "InventoryTrackingMode" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "assetNumber" TEXT NOT NULL,
  "serialNumber" TEXT,
  "status" "InventoryState" NOT NULL DEFAULT 'RENTABLE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryItem_assetNumber_check" CHECK ("assetNumber" = upper(trim("assetNumber")) AND length("assetNumber") BETWEEN 1 AND 100),
  CONSTRAINT "InventoryItem_serialNumber_check" CHECK ("serialNumber" IS NULL OR length(trim("serialNumber")) BETWEEN 1 AND 160)
);

CREATE TABLE "InventoryTransaction" (
  "id" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "kind" "InventoryTransactionKind" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "fromState" "InventoryState",
  "toState" "InventoryState",
  "operationId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransaction_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 1000000),
  CONSTRAINT "InventoryTransaction_reason_check" CHECK (length(trim("reason")) BETWEEN 1 AND 1000),
  CONSTRAINT "InventoryTransaction_state_check" CHECK ("fromState" IS NULL OR "toState" IS NULL OR "fromState" <> "toState"),
  CONSTRAINT "InventoryTransaction_shape_check" CHECK (
    ("kind" = 'INITIAL_STOCK' AND "inventoryItemId" IS NULL AND "fromState" IS NULL AND "toState" IS NOT NULL) OR
    ("kind" = 'BULK_MOVEMENT' AND "inventoryItemId" IS NULL AND "fromState" IS NOT NULL AND "toState" IS NOT NULL) OR
    ("kind" = 'SERIALIZED_ITEM_CREATED' AND "inventoryItemId" IS NOT NULL AND "quantity" = 1 AND "fromState" IS NULL AND "toState" IS NOT NULL) OR
    ("kind" = 'SERIALIZED_ITEM_STATE_CHANGED' AND "inventoryItemId" IS NOT NULL AND "quantity" = 1 AND "fromState" IS NOT NULL AND "toState" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "Inventory_productId_key" ON "Inventory"("productId");
CREATE INDEX "Inventory_trackingMode_id_idx" ON "Inventory"("trackingMode", "id");
CREATE UNIQUE INDEX "InventoryItem_assetNumber_key" ON "InventoryItem"("assetNumber");
CREATE INDEX "InventoryItem_inventoryId_status_id_idx" ON "InventoryItem"("inventoryId", "status", "id");
CREATE INDEX "InventoryItem_serialNumber_idx" ON "InventoryItem"("serialNumber");
CREATE UNIQUE INDEX "InventoryTransaction_operationId_key" ON "InventoryTransaction"("operationId");
CREATE INDEX "InventoryTransaction_inventoryId_createdAt_id_idx" ON "InventoryTransaction"("inventoryId", "createdAt", "id");
CREATE INDEX "InventoryTransaction_inventoryItemId_createdAt_id_idx" ON "InventoryTransaction"("inventoryItemId", "createdAt", "id");
CREATE INDEX "InventoryTransaction_actorUserId_createdAt_id_idx" ON "InventoryTransaction"("actorUserId", "createdAt", "id");
CREATE INDEX "InventoryTransaction_inventoryId_fromState_idx" ON "InventoryTransaction"("inventoryId", "fromState");
CREATE INDEX "InventoryTransaction_inventoryId_toState_idx" ON "InventoryTransaction"("inventoryId", "toState");

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_inventory_item_mode() RETURNS trigger AS $$
BEGIN
  IF (SELECT "trackingMode" FROM "Inventory" WHERE "id" = NEW."inventoryId") <> 'SERIALIZED' THEN
    RAISE EXCEPTION 'Inventory items require SERIALIZED tracking mode';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryItem_mode_guard" BEFORE INSERT OR UPDATE ON "InventoryItem" FOR EACH ROW EXECUTE FUNCTION enforce_inventory_item_mode();

CREATE FUNCTION enforce_inventory_transaction_mode() RETURNS trigger AS $$
DECLARE mode "InventoryTrackingMode";
BEGIN
  SELECT "trackingMode" INTO mode FROM "Inventory" WHERE "id" = NEW."inventoryId";
  IF NEW."kind" IN ('INITIAL_STOCK', 'BULK_MOVEMENT') AND mode <> 'BULK' THEN
    RAISE EXCEPTION 'Bulk transactions require BULK tracking mode';
  END IF;
  IF NEW."kind" IN ('SERIALIZED_ITEM_CREATED', 'SERIALIZED_ITEM_STATE_CHANGED') AND mode <> 'SERIALIZED' THEN
    RAISE EXCEPTION 'Serialized transactions require SERIALIZED tracking mode';
  END IF;
  IF NEW."inventoryItemId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "InventoryItem" WHERE "id" = NEW."inventoryItemId" AND "inventoryId" = NEW."inventoryId"
  ) THEN
    RAISE EXCEPTION 'Inventory item does not belong to inventory';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryTransaction_mode_guard" BEFORE INSERT ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION enforce_inventory_transaction_mode();

CREATE FUNCTION protect_inventory_transaction() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory transactions are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryTransaction_append_only_update" BEFORE UPDATE ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION protect_inventory_transaction();
CREATE TRIGGER "InventoryTransaction_append_only_delete" BEFORE DELETE ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION protect_inventory_transaction();

CREATE FUNCTION protect_inventory_tracking_mode() RETURNS trigger AS $$
BEGIN
  IF OLD."trackingMode" <> NEW."trackingMode" AND (
    EXISTS (SELECT 1 FROM "InventoryItem" WHERE "inventoryId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "InventoryTransaction" WHERE "inventoryId" = OLD."id")
  ) THEN
    RAISE EXCEPTION 'Inventory tracking mode is immutable after activity';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Inventory_tracking_mode_guard" BEFORE UPDATE ON "Inventory" FOR EACH ROW EXECUTE FUNCTION protect_inventory_tracking_mode();
