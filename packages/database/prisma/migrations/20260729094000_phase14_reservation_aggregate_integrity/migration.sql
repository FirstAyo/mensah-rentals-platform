-- Enforce that every operational reservation is a complete projection of its
-- order and that its lifecycle status agrees with the allocation summaries.
CREATE FUNCTION validate_inventory_reservation_aggregate() RETURNS trigger AS $$
DECLARE
  reservation_id TEXT;
  reservation_row "InventoryReservation"%ROWTYPE;
  order_item_count INTEGER;
  reservation_item_count INTEGER;
  total_reserved BIGINT;
  total_shortfall BIGINT;
  ever_allocated BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'InventoryReservation' THEN
    reservation_id := NEW."id";
  ELSE
    reservation_id := NEW."inventoryReservationId";
  END IF;

  SELECT * INTO reservation_row
  FROM "InventoryReservation"
  WHERE "id" = reservation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT count(*) INTO order_item_count
  FROM "RentalOrderItem"
  WHERE "rentalOrderId" = reservation_row."rentalOrderId";

  SELECT count(*), COALESCE(sum("reservedQuantity"), 0), COALESCE(sum("shortfallQuantity"), 0)
  INTO reservation_item_count, total_reserved, total_shortfall
  FROM "InventoryReservationItem"
  WHERE "inventoryReservationId" = reservation_id;

  IF reservation_item_count <> order_item_count OR reservation_item_count = 0 THEN
    RAISE EXCEPTION 'Reservation must contain one item for every rental order item';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "InventoryReservationOperationItem" oi
    JOIN "InventoryReservationOperation" operation ON operation."id" = oi."reservationOperationId"
    WHERE operation."inventoryReservationId" = reservation_id
      AND oi."quantityDelta" > 0
  ) INTO ever_allocated;

  IF reservation_row."status" = 'RESERVED' AND total_shortfall <> 0 THEN
    RAISE EXCEPTION 'A reserved aggregate cannot contain a shortfall';
  ELSIF reservation_row."status" = 'PARTIALLY_RESERVED' AND (total_reserved <= 0 OR total_shortfall <= 0) THEN
    RAISE EXCEPTION 'A partial reservation requires both allocations and a shortfall';
  ELSIF reservation_row."status" = 'RESERVATION_FAILED' AND total_reserved <> 0 THEN
    RAISE EXCEPTION 'A failed reservation cannot retain allocations';
  ELSIF reservation_row."status" = 'RELEASED' AND (total_reserved <> 0 OR NOT ever_allocated) THEN
    RAISE EXCEPTION 'A released reservation must have released its prior allocations';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "InventoryReservation_aggregate_consistency"
AFTER INSERT OR UPDATE OF "status", "version" ON "InventoryReservation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_inventory_reservation_aggregate();

CREATE CONSTRAINT TRIGGER "InventoryReservationItem_aggregate_consistency"
AFTER INSERT OR UPDATE ON "InventoryReservationItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_inventory_reservation_aggregate();
