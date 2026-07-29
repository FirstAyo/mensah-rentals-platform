-- Permit only a matching checkout operation to consume an active serialized
-- allocation, while retaining the Phase 14 release-only protection otherwise.
CREATE OR REPLACE FUNCTION validate_serialized_asset_allocation() RETURNS trigger AS $$
DECLARE reservation_row "InventoryReservation"%ROWTYPE; reservation_item_row "InventoryReservationItem"%ROWTYPE; allocation_operation "InventoryReservationOperation"%ROWTYPE; release_operation "InventoryReservationOperation"%ROWTYPE; checkout_operation "FulfilmentOperation"%ROWTYPE; fulfilment_reservation_id TEXT;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO reservation_item_row FROM "InventoryReservationItem" WHERE "id"=NEW."reservationItemId";
    SELECT * INTO reservation_row FROM "InventoryReservation" WHERE "id"=reservation_item_row."inventoryReservationId";
    SELECT * INTO allocation_operation FROM "InventoryReservationOperation" WHERE "id"=NEW."allocatedOperationId";
    IF reservation_item_row."reservationType"<>'SERIALIZED' OR allocation_operation."inventoryReservationId" IS DISTINCT FROM reservation_row."id" OR allocation_operation."actorUserId" IS DISTINCT FROM NEW."allocatedByUserId" OR NEW."rangeStartUtc" IS DISTINCT FROM reservation_row."rangeStartUtc" OR NEW."rangeEndExclusiveUtc" IS DISTINCT FROM reservation_row."rangeEndExclusiveUtc" THEN RAISE EXCEPTION 'Serialized allocation does not match its reservation'; END IF;
    IF NOT EXISTS(SELECT 1 FROM "InventoryItem" WHERE "id"=NEW."inventoryItemId" AND "inventoryId"=reservation_item_row."inventoryId" AND "status"='RENTABLE') THEN RAISE EXCEPTION 'Serialized asset is not rentable or does not match the ordered product'; END IF;
  ELSIF OLD."status"='ACTIVE' AND NEW."status"='RELEASED' THEN
    IF (to_jsonb(NEW)-ARRAY['status','releasedOperationId','releasedAt','releasedByUserId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','releasedOperationId','releasedAt','releasedByUserId']) THEN RAISE EXCEPTION 'Serialized allocation release may only change release fields'; END IF;
    SELECT * INTO reservation_item_row FROM "InventoryReservationItem" WHERE "id"=NEW."reservationItemId";
    SELECT * INTO release_operation FROM "InventoryReservationOperation" WHERE "id"=NEW."releasedOperationId";
    IF release_operation."inventoryReservationId" IS DISTINCT FROM reservation_item_row."inventoryReservationId" OR release_operation."actorUserId" IS DISTINCT FROM NEW."releasedByUserId" THEN RAISE EXCEPTION 'Serialized release operation does not match its reservation or actor'; END IF;
  ELSIF OLD."status"='ACTIVE' AND NEW."status"='CONSUMED' THEN
    IF (to_jsonb(NEW)-ARRAY['status','consumedFulfilmentOperationId','consumedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','consumedFulfilmentOperationId','consumedAt']) THEN RAISE EXCEPTION 'Serialized allocation checkout may only change consumption fields'; END IF;
    SELECT * INTO checkout_operation FROM "FulfilmentOperation" WHERE "id"=NEW."consumedFulfilmentOperationId";
    SELECT "inventoryReservationId" INTO fulfilment_reservation_id FROM "OrderFulfilment" WHERE "id"=checkout_operation."orderFulfilmentId";
    SELECT * INTO reservation_item_row FROM "InventoryReservationItem" WHERE "id"=NEW."reservationItemId";
    IF checkout_operation."type"<>'CHECKOUT' OR fulfilment_reservation_id IS DISTINCT FROM reservation_item_row."inventoryReservationId" THEN RAISE EXCEPTION 'Serialized consumption must use checkout for the matching reservation'; END IF;
  ELSE RAISE EXCEPTION 'Serialized allocation may only be released or consumed once'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE FUNCTION validate_consumed_serialized_checkout() RETURNS trigger AS $$
BEGIN
  IF NEW."status"='CONSUMED' AND NOT EXISTS(
    SELECT 1 FROM "ActiveRentalSerializedAsset" a
    JOIN "ActiveRentalItem" ari ON ari."id"=a."activeRentalItemId"
    JOIN "OrderFulfilmentItem" fi ON fi."id"=ari."orderFulfilmentItemId"
    WHERE a."serializedAllocationId"=NEW."id" AND a."inventoryItemId"=NEW."inventoryItemId" AND fi."reservationItemId"=NEW."reservationItemId"
  ) THEN RAISE EXCEPTION 'Consumed allocation requires a matching active-rental asset'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "SerializedAssetAllocation_checkout_guard" AFTER UPDATE OF "status" ON "SerializedAssetAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_consumed_serialized_checkout();
