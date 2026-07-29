-- Align Phase 14 immutable allocation-ledger checks and order projection state
-- transitions with Phase 15 reservation consumption.
CREATE OR REPLACE FUNCTION validate_reservation_item_ledger() RETURNS trigger AS $$
DECLARE target_item_id TEXT; summary "InventoryReservationItem"%ROWTYPE; delta_total BIGINT; active_assets BIGINT;
BEGIN
  IF TG_TABLE_NAME='InventoryReservationItem' THEN target_item_id:=NEW."id"; ELSE target_item_id:=NEW."reservationItemId"; END IF;
  SELECT * INTO summary FROM "InventoryReservationItem" WHERE "id"=target_item_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum("quantityDelta"),0) INTO delta_total FROM "InventoryReservationOperationItem" WHERE "reservationItemId"=target_item_id;
  IF summary."reservedQuantity" + summary."consumedQuantity" <> delta_total THEN
    RAISE EXCEPTION 'Reservation active plus consumed summary does not match immutable allocation ledger';
  END IF;
  IF summary."reservationType"='SERIALIZED' THEN
    SELECT count(*) INTO active_assets FROM "SerializedAssetAllocation" WHERE "reservationItemId"=target_item_id AND "status"='ACTIVE';
    IF summary."reservedQuantity"<>active_assets THEN RAISE EXCEPTION 'Serialized reservation summary does not match active allocations'; END IF;
    IF summary."consumedQuantity"<>(SELECT count(*) FROM "SerializedAssetAllocation" WHERE "reservationItemId"=target_item_id AND "status"='CONSUMED') THEN
      RAISE EXCEPTION 'Serialized consumed summary does not match consumed allocations';
    END IF;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_rental_order_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME<>'RentalOrder' THEN RAISE EXCEPTION 'Confirmed rental order history is append-only'; END IF;
  IF (to_jsonb(NEW)-ARRAY['reservationStatus','reservationVersion']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['reservationStatus','reservationVersion']) OR NEW."reservationVersion"<>OLD."reservationVersion"+1 THEN
    RAISE EXCEPTION 'Only a versioned rental-order reservation status transition is allowed';
  END IF;
  IF NOT (
    (OLD."reservationStatus"='NOT_RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RESERVATION_FAILED')) OR
    (OLD."reservationStatus"='RESERVATION_FAILED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RESERVATION_FAILED')) OR
    (OLD."reservationStatus"='PARTIALLY_RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RELEASED','PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus"='RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RELEASED','PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus"='PARTIALLY_CONSUMED' AND NEW."reservationStatus" IN ('PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus"='CONSUMED' AND NEW."reservationStatus"='CONSUMED') OR
    (OLD."reservationStatus"='RELEASED' AND NEW."reservationStatus"='RELEASED')
  ) THEN RAISE EXCEPTION 'Invalid rental-order reservation status transition'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
