-- PostgreSQL treats NULL values as distinct in a regular unique index. Bulk
-- deltas intentionally have no inventoryItemId, so use an explicit partial key
-- to ensure one bulk delta per operation and reservation item.
CREATE UNIQUE INDEX "InventoryReservationOperationItem_bulk_shape_key"
  ON "InventoryReservationOperationItem"("reservationOperationId", "reservationItemId")
  WHERE "inventoryItemId" IS NULL;

CREATE FUNCTION validate_reservation_operation_delta_direction() RETURNS trigger AS $$
DECLARE operation_type "InventoryReservationOperationType";
BEGIN
  SELECT "type" INTO operation_type
  FROM "InventoryReservationOperation"
  WHERE "id" = NEW."reservationOperationId";

  IF operation_type IN (
    'RESERVATION_CREATED',
    'RESERVATION_PARTIALLY_CREATED',
    'RESERVATION_COMPLETED',
    'RESERVATION_QUANTITY_ADDED',
    'SERIALIZED_ASSET_ALLOCATED'
  ) AND NEW."quantityDelta" <= 0 THEN
    RAISE EXCEPTION 'Reservation allocation operations require positive deltas';
  END IF;

  IF operation_type IN (
    'SERIALIZED_ASSET_RELEASED',
    'RESERVATION_QUANTITY_RELEASED',
    'RESERVATION_RELEASED'
  ) AND NEW."quantityDelta" >= 0 THEN
    RAISE EXCEPTION 'Reservation release operations require negative deltas';
  END IF;

  IF operation_type IN ('RESERVATION_FAILED', 'RESERVATION_OVERRIDE_RECORDED') THEN
    RAISE EXCEPTION 'Failure and override audit operations cannot change allocations directly';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservationOperationItem_direction_guard"
BEFORE INSERT ON "InventoryReservationOperationItem"
FOR EACH ROW EXECUTE FUNCTION validate_reservation_operation_delta_direction();
