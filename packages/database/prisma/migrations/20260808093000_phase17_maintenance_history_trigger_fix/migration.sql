DROP TRIGGER "MaintenanceNote_identity_guard" ON "MaintenanceNote";
DROP TRIGGER "InventoryTransaction_maintenance_identity_guard" ON "InventoryTransaction";
DROP FUNCTION validate_maintenance_history_identity();

CREATE FUNCTION validate_maintenance_note_identity() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "MaintenanceOperation" o
    WHERE o."id" = NEW."operationId"
      AND o."workOrderId" = NEW."workOrderId"
      AND o."actorUserId" = NEW."authorUserId"
      AND o."type" = 'NOTE_ADDED'
  ) THEN
    RAISE EXCEPTION 'Maintenance note identity does not match its operation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_maintenance_inventory_transaction_identity() RETURNS trigger AS $$
BEGIN
  IF NEW."maintenanceOperationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "MaintenanceOperation" o
    LEFT JOIN "MaintenanceWorkOrder" w ON w."id" = o."workOrderId"
    LEFT JOIN "EquipmentInspection" i ON i."id" = o."inspectionId"
    WHERE o."id" = NEW."maintenanceOperationId"
      AND NEW."inventoryId" = COALESCE(w."inventoryId", i."inventoryId")
      AND NEW."inventoryItemId" IS NOT DISTINCT FROM COALESCE(w."inventoryItemId", i."inventoryItemId")
  ) THEN
    RAISE EXCEPTION 'Maintenance inventory movement does not match its target';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "MaintenanceNote_identity_guard"
AFTER INSERT ON "MaintenanceNote"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_maintenance_note_identity();

CREATE CONSTRAINT TRIGGER "InventoryTransaction_maintenance_identity_guard"
AFTER INSERT OR UPDATE OF "maintenanceOperationId" ON "InventoryTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_maintenance_inventory_transaction_identity();
