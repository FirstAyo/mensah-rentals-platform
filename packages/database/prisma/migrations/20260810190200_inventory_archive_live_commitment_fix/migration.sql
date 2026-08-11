-- Archive safety is based on live reserved quantity, not immutable reservation history.
CREATE OR REPLACE FUNCTION protect_inventory_archive() RETURNS trigger AS $$
DECLARE physical_total BIGINT;
BEGIN
  IF OLD."isActive" AND NOT NEW."isActive" THEN
    IF OLD."trackingMode"='SERIALIZED' THEN
      SELECT count(*) INTO physical_total FROM "InventoryItem" WHERE "inventoryId"=OLD."id";
    ELSE
      SELECT COALESCE(sum(CASE WHEN "toState" IS NOT NULL THEN "quantity" ELSE 0 END),0)
           - COALESCE(sum(CASE WHEN "fromState" IS NOT NULL THEN "quantity" ELSE 0 END),0)
        INTO physical_total FROM "InventoryTransaction" WHERE "inventoryId"=OLD."id";
    END IF;
    IF physical_total<>0 THEN RAISE EXCEPTION 'Inventory with physical stock cannot be archived'; END IF;
    IF EXISTS (
      SELECT 1 FROM "InventoryReservationItem"
      WHERE "inventoryId"=OLD."id" AND "reservedQuantity">0
    ) THEN RAISE EXCEPTION 'Inventory with active reservations cannot be archived'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
