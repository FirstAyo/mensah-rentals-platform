-- Phase 15: internal fulfilment, atomic checkout/handoff, and active rentals.
-- Nothing in this migration creates a public inventory surface or return workflow.

ALTER TABLE "InventoryReservationItem" ADD COLUMN "consumedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SerializedAssetAllocation"
  ADD COLUMN "consumedFulfilmentOperationId" TEXT,
  ADD COLUMN "consumedAt" TIMESTAMPTZ(3);
ALTER TABLE "SerializedAssetAllocation" DROP CONSTRAINT "SerializedAssetAllocation_release_check";
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_release_check" CHECK (
  ("status"='ACTIVE' AND "releasedAt" IS NULL AND "releasedByUserId" IS NULL AND "releasedOperationId" IS NULL AND "consumedAt" IS NULL AND "consumedFulfilmentOperationId" IS NULL) OR
  ("status"='RELEASED' AND "releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL AND "releasedOperationId" IS NOT NULL AND "releasedAt">="allocatedAt" AND "consumedAt" IS NULL AND "consumedFulfilmentOperationId" IS NULL) OR
  ("status"='CONSUMED' AND "releasedAt" IS NULL AND "releasedByUserId" IS NULL AND "releasedOperationId" IS NULL AND "consumedAt" IS NOT NULL AND "consumedFulfilmentOperationId" IS NOT NULL AND "consumedAt">="allocatedAt")
);
ALTER TABLE "InventoryTransaction" ADD COLUMN "fulfilmentOperationId" TEXT;

ALTER TABLE "InventoryReservationItem" DROP CONSTRAINT "InventoryReservationItem_quantity_check";
ALTER TABLE "InventoryReservationItem" ADD CONSTRAINT "InventoryReservationItem_quantity_check" CHECK (
  "requestedQuantity" > 0 AND "reservedQuantity" >= 0 AND "consumedQuantity" >= 0 AND
  "shortfallQuantity" >= 0 AND
  "reservedQuantity" + "consumedQuantity" + "shortfallQuantity" = "requestedQuantity"
);

CREATE TABLE "OrderFulfilment" (
  "id" TEXT PRIMARY KEY,
  "rentalOrderId" TEXT NOT NULL UNIQUE,
  "inventoryReservationId" TEXT NOT NULL UNIQUE,
  "status" "OrderFulfilmentStatus" NOT NULL DEFAULT 'PREPARING',
  "fulfilmentMethod" "RentalRequestFulfillmentMethod" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "preparationStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMPTZ(3),
  "firstCheckedOutAt" TIMESTAMPTZ(3),
  "fullyCheckedOutAt" TIMESTAMPTZ(3),
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OrderFulfilment_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "OrderFulfilmentItem" (
  "id" TEXT PRIMARY KEY,
  "orderFulfilmentId" TEXT NOT NULL,
  "rentalOrderItemId" TEXT NOT NULL UNIQUE,
  "reservationItemId" TEXT NOT NULL UNIQUE,
  "orderedQuantitySnapshot" INTEGER NOT NULL,
  "preparedQuantity" INTEGER NOT NULL DEFAULT 0,
  "checkedOutQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OrderFulfilmentItem_quantity_check" CHECK (
    "orderedQuantitySnapshot" > 0 AND "preparedQuantity" >= 0 AND
    "checkedOutQuantity" >= 0 AND "checkedOutQuantity" <= "orderedQuantitySnapshot"
  ),
  CONSTRAINT "OrderFulfilmentItem_order_item_key" UNIQUE ("orderFulfilmentId","rentalOrderItemId")
);

CREATE TABLE "FulfilmentOperation" (
  "id" TEXT PRIMARY KEY,
  "orderFulfilmentId" TEXT NOT NULL,
  "type" "FulfilmentOperationType" NOT NULL,
  "operationId" UUID NOT NULL UNIQUE,
  "payloadHash" CHAR(64) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "internalReason" TEXT,
  "metadata" JSONB,
  "expectedVersion" INTEGER NOT NULL,
  "resultingVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FulfilmentOperation_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "FulfilmentOperation_version_check" CHECK ("expectedVersion" >= 0 AND "resultingVersion"="expectedVersion"+1),
  CONSTRAINT "FulfilmentOperation_reason_check" CHECK ("internalReason" IS NULL OR length(trim("internalReason")) BETWEEN 1 AND 2000)
);

CREATE TABLE "FulfilmentOperationItem" (
  "id" TEXT PRIMARY KEY,
  "fulfilmentOperationId" TEXT NOT NULL,
  "orderFulfilmentItemId" TEXT NOT NULL,
  "preparedDelta" INTEGER NOT NULL DEFAULT 0,
  "checkedOutDelta" INTEGER NOT NULL DEFAULT 0,
  "serializedAllocationId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FulfilmentOperationItem_delta_check" CHECK ("preparedDelta" <> 0 OR "checkedOutDelta" <> 0),
  CONSTRAINT "FulfilmentOperationItem_shape_key" UNIQUE ("fulfilmentOperationId","orderFulfilmentItemId","serializedAllocationId")
);
CREATE UNIQUE INDEX "FulfilmentOperationItem_bulk_shape_key" ON "FulfilmentOperationItem"("fulfilmentOperationId","orderFulfilmentItemId") WHERE "serializedAllocationId" IS NULL;

CREATE TABLE "ActiveRental" (
  "id" TEXT PRIMARY KEY,
  "rentalOrderId" TEXT NOT NULL UNIQUE,
  "orderFulfilmentId" TEXT NOT NULL UNIQUE,
  "status" "ActiveRentalStatus" NOT NULL,
  "rentalStartAt" TIMESTAMPTZ(3) NOT NULL,
  "expectedReturnAt" TIMESTAMPTZ(3) NOT NULL,
  "checkedOutAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedByUserId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ActiveRental_dates_check" CHECK ("rentalStartAt" < "expectedReturnAt"),
  CONSTRAINT "ActiveRental_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "ActiveRentalItem" (
  "id" TEXT PRIMARY KEY,
  "activeRentalId" TEXT NOT NULL,
  "rentalOrderItemId" TEXT NOT NULL UNIQUE,
  "orderFulfilmentItemId" TEXT NOT NULL UNIQUE,
  "checkedOutQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ActiveRentalItem_quantity_check" CHECK ("checkedOutQuantity" > 0),
  CONSTRAINT "ActiveRentalItem_order_item_key" UNIQUE ("activeRentalId","rentalOrderItemId")
);

CREATE TABLE "ActiveRentalSerializedAsset" (
  "id" TEXT PRIMARY KEY,
  "activeRentalItemId" TEXT NOT NULL,
  "serializedAllocationId" TEXT NOT NULL UNIQUE,
  "inventoryItemId" TEXT NOT NULL UNIQUE,
  "checkedOutAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FulfilmentHandoff" (
  "id" TEXT PRIMARY KEY,
  "activeRentalId" TEXT NOT NULL,
  "fulfilmentOperationId" TEXT NOT NULL UNIQUE,
  "type" "FulfilmentHandoffType" NOT NULL,
  "recipientName" TEXT,
  "destinationSnapshot" TEXT,
  "acknowledgementReference" TEXT,
  "internalNotes" TEXT,
  "actorUserId" TEXT NOT NULL,
  "handoffAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FulfilmentHandoff_recipient_check" CHECK ("recipientName" IS NULL OR length(trim("recipientName")) BETWEEN 1 AND 200),
  CONSTRAINT "FulfilmentHandoff_ack_check" CHECK ("acknowledgementReference" IS NULL OR length(trim("acknowledgementReference")) BETWEEN 1 AND 500),
  CONSTRAINT "FulfilmentHandoff_notes_check" CHECK ("internalNotes" IS NULL OR length(trim("internalNotes")) BETWEEN 1 AND 2000)
);

CREATE INDEX "OrderFulfilment_status_updated_idx" ON "OrderFulfilment"("status","updatedAt","id");
CREATE INDEX "OrderFulfilmentItem_fulfilment_idx" ON "OrderFulfilmentItem"("orderFulfilmentId","id");
CREATE INDEX "FulfilmentOperation_fulfilment_created_idx" ON "FulfilmentOperation"("orderFulfilmentId","createdAt","id");
CREATE INDEX "FulfilmentOperation_actor_created_idx" ON "FulfilmentOperation"("actorUserId","createdAt","id");
CREATE INDEX "FulfilmentOperationItem_item_created_idx" ON "FulfilmentOperationItem"("orderFulfilmentItemId","createdAt","id");
CREATE INDEX "ActiveRental_status_return_idx" ON "ActiveRental"("status","expectedReturnAt","id");
CREATE INDEX "ActiveRentalItem_rental_idx" ON "ActiveRentalItem"("activeRentalId","id");
CREATE INDEX "ActiveRentalSerializedAsset_item_idx" ON "ActiveRentalSerializedAsset"("activeRentalItemId","id");
CREATE INDEX "FulfilmentHandoff_rental_time_idx" ON "FulfilmentHandoff"("activeRentalId","handoffAt","id");
CREATE INDEX "FulfilmentHandoff_actor_time_idx" ON "FulfilmentHandoff"("actorUserId","handoffAt","id");
CREATE INDEX "SerializedAssetAllocation_consumed_operation_idx" ON "SerializedAssetAllocation"("consumedFulfilmentOperationId");
CREATE INDEX "InventoryTransaction_fulfilment_idx" ON "InventoryTransaction"("fulfilmentOperationId","createdAt","id");

ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_reservation_fkey" FOREIGN KEY ("inventoryReservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilment" ADD CONSTRAINT "OrderFulfilment_updater_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilmentItem" ADD CONSTRAINT "OrderFulfilmentItem_fulfilment_fkey" FOREIGN KEY ("orderFulfilmentId") REFERENCES "OrderFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilmentItem" ADD CONSTRAINT "OrderFulfilmentItem_order_item_fkey" FOREIGN KEY ("rentalOrderItemId") REFERENCES "RentalOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFulfilmentItem" ADD CONSTRAINT "OrderFulfilmentItem_reservation_item_fkey" FOREIGN KEY ("reservationItemId") REFERENCES "InventoryReservationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentOperation" ADD CONSTRAINT "FulfilmentOperation_fulfilment_fkey" FOREIGN KEY ("orderFulfilmentId") REFERENCES "OrderFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentOperation" ADD CONSTRAINT "FulfilmentOperation_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentOperationItem" ADD CONSTRAINT "FulfilmentOperationItem_operation_fkey" FOREIGN KEY ("fulfilmentOperationId") REFERENCES "FulfilmentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentOperationItem" ADD CONSTRAINT "FulfilmentOperationItem_item_fkey" FOREIGN KEY ("orderFulfilmentItemId") REFERENCES "OrderFulfilmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentOperationItem" ADD CONSTRAINT "FulfilmentOperationItem_allocation_fkey" FOREIGN KEY ("serializedAllocationId") REFERENCES "SerializedAssetAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRental" ADD CONSTRAINT "ActiveRental_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRental" ADD CONSTRAINT "ActiveRental_fulfilment_fkey" FOREIGN KEY ("orderFulfilmentId") REFERENCES "OrderFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRental" ADD CONSTRAINT "ActiveRental_activator_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRentalItem" ADD CONSTRAINT "ActiveRentalItem_rental_fkey" FOREIGN KEY ("activeRentalId") REFERENCES "ActiveRental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRentalItem" ADD CONSTRAINT "ActiveRentalItem_order_item_fkey" FOREIGN KEY ("rentalOrderItemId") REFERENCES "RentalOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRentalItem" ADD CONSTRAINT "ActiveRentalItem_fulfilment_item_fkey" FOREIGN KEY ("orderFulfilmentItemId") REFERENCES "OrderFulfilmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRentalSerializedAsset" ADD CONSTRAINT "ActiveRentalSerializedAsset_rental_item_fkey" FOREIGN KEY ("activeRentalItemId") REFERENCES "ActiveRentalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRentalSerializedAsset" ADD CONSTRAINT "ActiveRentalSerializedAsset_allocation_fkey" FOREIGN KEY ("serializedAllocationId") REFERENCES "SerializedAssetAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActiveRentalSerializedAsset" ADD CONSTRAINT "ActiveRentalSerializedAsset_inventory_item_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentHandoff" ADD CONSTRAINT "FulfilmentHandoff_rental_fkey" FOREIGN KEY ("activeRentalId") REFERENCES "ActiveRental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentHandoff" ADD CONSTRAINT "FulfilmentHandoff_operation_fkey" FOREIGN KEY ("fulfilmentOperationId") REFERENCES "FulfilmentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentHandoff" ADD CONSTRAINT "FulfilmentHandoff_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_consumed_operation_fkey" FOREIGN KEY ("consumedFulfilmentOperationId") REFERENCES "FulfilmentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_fulfilment_fkey" FOREIGN KEY ("fulfilmentOperationId") REFERENCES "FulfilmentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing serialized overlap remains active for both unconsumed commitments and checked-out assets.
ALTER TABLE "SerializedAssetAllocation" DROP CONSTRAINT "SerializedAssetAllocation_no_active_overlap";
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_no_active_overlap" EXCLUDE USING gist (
  "inventoryItemId" WITH =, tstzrange("rangeStartUtc","rangeEndExclusiveUtc",'[)') WITH &&
) WHERE ("status" IN ('ACTIVE','CONSUMED')) DEFERRABLE INITIALLY IMMEDIATE;

DROP TRIGGER IF EXISTS "InventoryTransaction_serialized_reservation_guard" ON "InventoryTransaction";
DROP TRIGGER IF EXISTS "InventoryItem_active_reservation_guard" ON "InventoryItem";

CREATE OR REPLACE FUNCTION protect_serialized_inventory_transaction() RETURNS trigger AS $$
BEGIN
  IF NEW."kind"='SERIALIZED_ITEM_STATE_CHANGED' AND NEW."fromState"='RENTABLE' AND NEW."toState"='RENTED' THEN
    IF NEW."fulfilmentOperationId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "SerializedAssetAllocation" a
      JOIN "FulfilmentOperation" o ON o."id"=NEW."fulfilmentOperationId" AND o."type"='CHECKOUT'
      WHERE a."inventoryItemId"=NEW."inventoryItemId" AND a."status" IN ('ACTIVE','CONSUMED')
    ) THEN RAISE EXCEPTION 'Serialized checkout requires a matching fulfilment operation and allocation'; END IF;
  ELSIF NEW."kind"='SERIALIZED_ITEM_STATE_CHANGED' AND NEW."fromState"='RENTABLE' AND NEW."toState"<>'RENTABLE'
    AND EXISTS (SELECT 1 FROM "SerializedAssetAllocation" WHERE "inventoryItemId"=NEW."inventoryItemId" AND "status"='ACTIVE') THEN
    RAISE EXCEPTION 'Serialized inventory transaction would invalidate an active reservation';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryTransaction_serialized_reservation_guard" BEFORE INSERT ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION protect_serialized_inventory_transaction();

CREATE OR REPLACE FUNCTION protect_allocated_inventory_item_state() RETURNS trigger AS $$
BEGIN
  IF OLD."status"='RENTABLE' AND NEW."status"='RENTED' AND EXISTS (
    SELECT 1 FROM "SerializedAssetAllocation" WHERE "inventoryItemId"=NEW."id" AND "status"='ACTIVE'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM "InventoryTransaction" WHERE "inventoryItemId"=NEW."id" AND "toState"='RENTED' AND "fulfilmentOperationId" IS NOT NULL) THEN
      RAISE EXCEPTION 'Allocated serialized asset can only become rented through checkout';
    END IF;
  ELSIF OLD."status"='RENTABLE' AND NEW."status"<>'RENTABLE' AND EXISTS (
    SELECT 1 FROM "SerializedAssetAllocation" WHERE "inventoryItemId"=NEW."id" AND "status"='ACTIVE'
  ) THEN RAISE EXCEPTION 'Inventory item state would invalidate an active reservation';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryItem_active_reservation_guard" BEFORE UPDATE OF "status" ON "InventoryItem" FOR EACH ROW EXECUTE FUNCTION protect_allocated_inventory_item_state();

CREATE FUNCTION protect_fulfilment_history() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Fulfilment history is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FulfilmentOperation_immutable" BEFORE UPDATE OR DELETE ON "FulfilmentOperation" FOR EACH ROW EXECUTE FUNCTION protect_fulfilment_history();
CREATE TRIGGER "FulfilmentOperationItem_immutable" BEFORE UPDATE OR DELETE ON "FulfilmentOperationItem" FOR EACH ROW EXECUTE FUNCTION protect_fulfilment_history();
CREATE TRIGGER "FulfilmentHandoff_immutable" BEFORE UPDATE OR DELETE ON "FulfilmentHandoff" FOR EACH ROW EXECUTE FUNCTION protect_fulfilment_history();
CREATE TRIGGER "ActiveRentalSerializedAsset_immutable" BEFORE UPDATE OR DELETE ON "ActiveRentalSerializedAsset" FOR EACH ROW EXECUTE FUNCTION protect_fulfilment_history();

CREATE FUNCTION validate_fulfilment_operation_version() RETURNS trigger AS $$
DECLARE current_version INTEGER;
BEGIN
  SELECT "version" INTO current_version FROM "OrderFulfilment" WHERE "id"=NEW."orderFulfilmentId" FOR UPDATE;
  IF current_version IS DISTINCT FROM NEW."expectedVersion" THEN RAISE EXCEPTION 'Fulfilment operation has a stale version'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FulfilmentOperation_version_guard" BEFORE INSERT ON "FulfilmentOperation" FOR EACH ROW EXECUTE FUNCTION validate_fulfilment_operation_version();

CREATE FUNCTION validate_fulfilment_aggregate() RETURNS trigger AS $$
DECLARE f_item "OrderFulfilmentItem"%ROWTYPE; r_item "InventoryReservationItem"%ROWTYPE;
BEGIN
  SELECT * INTO f_item FROM "OrderFulfilmentItem" WHERE "id"=COALESCE(NEW."id",OLD."id");
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO r_item FROM "InventoryReservationItem" WHERE "id"=f_item."reservationItemId";
  IF f_item."checkedOutQuantity" <> r_item."consumedQuantity" THEN RAISE EXCEPTION 'Fulfilment checkout must match reservation consumption'; END IF;
  IF f_item."preparedQuantity" > r_item."reservedQuantity" THEN RAISE EXCEPTION 'Prepared quantity cannot exceed active reserved quantity'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "OrderFulfilmentItem_aggregate_guard" AFTER INSERT OR UPDATE ON "OrderFulfilmentItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_fulfilment_aggregate();

-- Align Phase 14 aggregate states with explicit consumption.
CREATE OR REPLACE FUNCTION validate_inventory_reservation_aggregate() RETURNS trigger AS $$
DECLARE reservation_id TEXT; reservation_row "InventoryReservation"%ROWTYPE; order_item_count INTEGER; reservation_item_count INTEGER; total_reserved BIGINT; total_consumed BIGINT; total_shortfall BIGINT; ever_allocated BOOLEAN;
BEGIN
  reservation_id := CASE WHEN TG_TABLE_NAME='InventoryReservation' THEN NEW."id" ELSE NEW."inventoryReservationId" END;
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
