DROP INDEX "InventoryTransaction_return_destination_key";

-- Bulk return movements are coalesced once per destination bucket. Serialized
-- movements retain one ledger row per exact asset, even when several assets in
-- the same return line share a disposition.
CREATE UNIQUE INDEX "InventoryTransaction_bulk_return_destination_key"
  ON "InventoryTransaction"("returnOperationItemId", "toState")
  WHERE "returnOperationItemId" IS NOT NULL AND "inventoryItemId" IS NULL;

CREATE UNIQUE INDEX "InventoryTransaction_serial_return_asset_key"
  ON "InventoryTransaction"("returnOperationItemId", "inventoryItemId")
  WHERE "returnOperationItemId" IS NOT NULL AND "inventoryItemId" IS NOT NULL;
