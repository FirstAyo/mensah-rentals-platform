-- PostgreSQL resolves every NEW field referenced by a polymorphic trigger
-- function against the trigger's current table. Read the row as JSON so the
-- same deferred integrity function can safely serve both parent and child
-- tables without referring to a column absent from one of them.
CREATE OR REPLACE FUNCTION validate_inventory_reservation_aggregate() RETURNS trigger AS $$
DECLARE reservation_id TEXT; reservation_row "InventoryReservation"%ROWTYPE; order_item_count INTEGER; reservation_item_count INTEGER; total_reserved BIGINT; total_consumed BIGINT; total_shortfall BIGINT; ever_allocated BOOLEAN;
BEGIN
  reservation_id := CASE
    WHEN TG_TABLE_NAME='InventoryReservation' THEN to_jsonb(NEW)->>'id'
    ELSE to_jsonb(NEW)->>'inventoryReservationId'
  END;
  SELECT * INTO reservation_row FROM "InventoryReservation" WHERE "id"=reservation_id; IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO order_item_count FROM "RentalOrderItem" WHERE "rentalOrderId"=reservation_row."rentalOrderId";
  SELECT count(*),COALESCE(sum("reservedQuantity"),0),COALESCE(sum("consumedQuantity"),0),COALESCE(sum("shortfallQuantity"),0)
    INTO reservation_item_count,total_reserved,total_consumed,total_shortfall FROM "InventoryReservationItem" WHERE "inventoryReservationId"=reservation_id;
  IF reservation_item_count<>order_item_count OR reservation_item_count=0 THEN RAISE EXCEPTION 'Reservation must contain one item for every rental order item'; END IF;
  SELECT EXISTS(SELECT 1 FROM "InventoryReservationOperationItem" oi JOIN "InventoryReservationOperation" op ON op."id"=oi."reservationOperationId" WHERE op."inventoryReservationId"=reservation_id AND oi."quantityDelta">0) INTO ever_allocated;
  IF reservation_row."status"='RESERVED' AND (total_shortfall<>0 OR total_consumed<>0) THEN RAISE EXCEPTION 'Reserved aggregate cannot contain shortfall or consumption';
  ELSIF reservation_row."status"='PARTIALLY_RESERVED' AND (total_reserved<=0 OR total_shortfall<=0 OR total_consumed<>0) THEN RAISE EXCEPTION 'Partial reservation requires allocations and shortfall only';
  ELSIF reservation_row."status"='PARTIALLY_CONSUMED' AND (total_consumed<=0 OR total_reserved<=0) THEN RAISE EXCEPTION 'Partial consumption requires consumed and active reserved quantity';
  ELSIF reservation_row."status"='CONSUMED' AND (total_consumed<=0 OR total_reserved<>0) THEN RAISE EXCEPTION 'Consumed reservation cannot retain active reserved quantity';
  ELSIF reservation_row."status"='RESERVATION_FAILED' AND (total_reserved<>0 OR total_consumed<>0) THEN RAISE EXCEPTION 'Failed reservation cannot retain allocations';
  ELSIF reservation_row."status"='RELEASED' AND (total_reserved<>0 OR total_consumed<>0 OR NOT ever_allocated) THEN RAISE EXCEPTION 'Released reservation must have no active or consumed quantity'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_reservation_item_ledger() RETURNS trigger AS $$
DECLARE target_item_id TEXT; summary "InventoryReservationItem"%ROWTYPE; delta_total BIGINT; active_assets BIGINT;
BEGIN
  IF TG_TABLE_NAME='InventoryReservationItem' THEN
    target_item_id:=to_jsonb(NEW)->>'id';
  ELSE
    target_item_id:=to_jsonb(NEW)->>'reservationItemId';
  END IF;
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
