-- Reject both the serialized state-change ledger entry and the item mutation
-- when either would invalidate an active serialized reservation.
CREATE FUNCTION protect_serialized_inventory_transaction() RETURNS trigger AS $$
BEGIN
  IF NEW."kind" = 'SERIALIZED_ITEM_STATE_CHANGED'
     AND NEW."fromState" = 'RENTABLE'
     AND NEW."toState" <> 'RENTABLE'
     AND EXISTS (
       SELECT 1
       FROM "SerializedAssetAllocation"
       WHERE "inventoryItemId" = NEW."inventoryItemId"
         AND "status" = 'ACTIVE'
     ) THEN
    RAISE EXCEPTION 'Serialized inventory transaction would invalidate an active reservation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryTransaction_serialized_reservation_guard"
BEFORE INSERT ON "InventoryTransaction"
FOR EACH ROW EXECUTE FUNCTION protect_serialized_inventory_transaction();
