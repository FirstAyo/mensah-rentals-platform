-- Phase 14: internal date-range inventory reservations.
-- Customer-facing contracts remain unchanged; every table below is administrative.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TYPE "RentalOrderReservationStatus" ADD VALUE 'PARTIALLY_RESERVED';
ALTER TYPE "RentalOrderReservationStatus" ADD VALUE 'RESERVED';
ALTER TYPE "RentalOrderReservationStatus" ADD VALUE 'RESERVATION_FAILED';
ALTER TYPE "RentalOrderReservationStatus" ADD VALUE 'RELEASED';

CREATE TYPE "InventoryReservationStatus" AS ENUM (
  'PENDING',
  'PARTIALLY_RESERVED',
  'RESERVED',
  'RESERVATION_FAILED',
  'RELEASED'
);

CREATE TYPE "InventoryReservationItemType" AS ENUM ('BULK', 'SERIALIZED');

CREATE TYPE "InventoryReservationOperationType" AS ENUM (
  'RESERVATION_CREATED',
  'RESERVATION_PARTIALLY_CREATED',
  'RESERVATION_COMPLETED',
  'RESERVATION_QUANTITY_ADDED',
  'SERIALIZED_ASSET_ALLOCATED',
  'SERIALIZED_ASSET_RELEASED',
  'RESERVATION_QUANTITY_RELEASED',
  'RESERVATION_RELEASED',
  'RESERVATION_FAILED',
  'RESERVATION_OVERRIDE_RECORDED'
);

CREATE TYPE "SerializedAssetAllocationStatus" AS ENUM ('ACTIVE', 'RELEASED');

ALTER TABLE "RentalOrder"
  ADD COLUMN "reservationVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "InventoryReservation" (
  "id" TEXT NOT NULL,
  "rentalOrderId" TEXT NOT NULL,
  "reservationNumber" TEXT NOT NULL,
  "status" "InventoryReservationStatus" NOT NULL DEFAULT 'PENDING',
  "rentalStartDateSnapshot" DATE NOT NULL,
  "rentalEndDateSnapshot" DATE NOT NULL,
  "rangeStartUtc" TIMESTAMPTZ(3) NOT NULL,
  "rangeEndExclusiveUtc" TIMESTAMPTZ(3) NOT NULL,
  "requestedTimeZoneSnapshot" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryReservation_number_check" CHECK ("reservationNumber" ~ '^IR-[0-9A-F]{20}$'),
  CONSTRAINT "InventoryReservation_dates_check" CHECK (
    "rentalStartDateSnapshot" <= "rentalEndDateSnapshot" AND
    "rangeStartUtc" < "rangeEndExclusiveUtc"
  ),
  CONSTRAINT "InventoryReservation_timezone_check" CHECK (length(trim("requestedTimeZoneSnapshot")) BETWEEN 1 AND 100),
  CONSTRAINT "InventoryReservation_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "InventoryReservationItem" (
  "id" TEXT NOT NULL,
  "inventoryReservationId" TEXT NOT NULL,
  "rentalOrderItemId" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "productIdSnapshot" TEXT NOT NULL,
  "reservationType" "InventoryReservationItemType" NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "shortfallQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InventoryReservationItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryReservationItem_quantity_check" CHECK (
    "requestedQuantity" > 0 AND
    "reservedQuantity" >= 0 AND
    "reservedQuantity" <= "requestedQuantity" AND
    "shortfallQuantity" = "requestedQuantity" - "reservedQuantity"
  )
);

CREATE TABLE "InventoryReservationOperation" (
  "id" TEXT NOT NULL,
  "inventoryReservationId" TEXT NOT NULL,
  "type" "InventoryReservationOperationType" NOT NULL,
  "operationId" UUID NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "expectedVersion" INTEGER NOT NULL,
  "resultingVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReservationOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryReservationOperation_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "InventoryReservationOperation_version_check" CHECK (
    "expectedVersion" >= 0 AND "resultingVersion" = "expectedVersion" + 1
  ),
  CONSTRAINT "InventoryReservationOperation_reason_check" CHECK (
    "reason" IS NULL OR length(trim("reason")) BETWEEN 1 AND 1000
  )
);

CREATE TABLE "InventoryReservationOperationItem" (
  "id" TEXT NOT NULL,
  "reservationOperationId" TEXT NOT NULL,
  "reservationItemId" TEXT NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "inventoryItemId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReservationOperationItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryReservationOperationItem_delta_check" CHECK (
    "quantityDelta" <> 0 AND abs("quantityDelta") <= 1000000
  )
);

CREATE TABLE "SerializedAssetAllocation" (
  "id" TEXT NOT NULL,
  "reservationItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "allocatedOperationId" TEXT NOT NULL,
  "releasedOperationId" TEXT,
  "rangeStartUtc" TIMESTAMPTZ(3) NOT NULL,
  "rangeEndExclusiveUtc" TIMESTAMPTZ(3) NOT NULL,
  "status" "SerializedAssetAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
  "allocatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMPTZ(3),
  "allocatedByUserId" TEXT NOT NULL,
  "releasedByUserId" TEXT,
  CONSTRAINT "SerializedAssetAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SerializedAssetAllocation_range_check" CHECK ("rangeStartUtc" < "rangeEndExclusiveUtc"),
  CONSTRAINT "SerializedAssetAllocation_release_check" CHECK (
    ("status" = 'ACTIVE' AND "releasedAt" IS NULL AND "releasedByUserId" IS NULL AND "releasedOperationId" IS NULL) OR
    ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL AND "releasedOperationId" IS NOT NULL AND "releasedAt" >= "allocatedAt")
  )
);

CREATE UNIQUE INDEX "InventoryReservation_rentalOrderId_key" ON "InventoryReservation"("rentalOrderId");
CREATE UNIQUE INDEX "InventoryReservation_reservationNumber_key" ON "InventoryReservation"("reservationNumber");
CREATE INDEX "InventoryReservation_status_range_idx" ON "InventoryReservation"("status", "rangeStartUtc", "rangeEndExclusiveUtc", "id");
CREATE INDEX "InventoryReservation_creator_created_idx" ON "InventoryReservation"("createdByUserId", "createdAt", "id");

CREATE UNIQUE INDEX "InventoryReservationItem_rentalOrderItemId_key" ON "InventoryReservationItem"("rentalOrderItemId");
CREATE UNIQUE INDEX "InventoryReservationItem_reservation_order_item_key" ON "InventoryReservationItem"("inventoryReservationId", "rentalOrderItemId");
CREATE UNIQUE INDEX "InventoryReservationItem_reservation_inventory_key" ON "InventoryReservationItem"("inventoryReservationId", "inventoryId");
CREATE INDEX "InventoryReservationItem_reservation_created_idx" ON "InventoryReservationItem"("inventoryReservationId", "createdAt", "id");
CREATE INDEX "InventoryReservationItem_inventory_type_idx" ON "InventoryReservationItem"("inventoryId", "reservationType", "id");

CREATE UNIQUE INDEX "InventoryReservationOperation_operationId_key" ON "InventoryReservationOperation"("operationId");
CREATE INDEX "InventoryReservationOperation_reservation_created_idx" ON "InventoryReservationOperation"("inventoryReservationId", "createdAt", "id");
CREATE INDEX "InventoryReservationOperation_actor_created_idx" ON "InventoryReservationOperation"("actorUserId", "createdAt", "id");

CREATE UNIQUE INDEX "InventoryReservationOperationItem_shape_key" ON "InventoryReservationOperationItem"("reservationOperationId", "reservationItemId", "inventoryItemId");
CREATE INDEX "InventoryReservationOperationItem_item_created_idx" ON "InventoryReservationOperationItem"("reservationItemId", "createdAt", "id");
CREATE INDEX "InventoryReservationOperationItem_asset_created_idx" ON "InventoryReservationOperationItem"("inventoryItemId", "createdAt", "id");

CREATE INDEX "SerializedAssetAllocation_reservation_item_status_idx" ON "SerializedAssetAllocation"("reservationItemId", "status", "id");
CREATE INDEX "SerializedAssetAllocation_asset_status_range_idx" ON "SerializedAssetAllocation"("inventoryItemId", "status", "rangeStartUtc", "rangeEndExclusiveUtc", "id");
CREATE INDEX "SerializedAssetAllocation_allocated_operation_idx" ON "SerializedAssetAllocation"("allocatedOperationId");
CREATE INDEX "SerializedAssetAllocation_released_operation_idx" ON "SerializedAssetAllocation"("releasedOperationId");

ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_no_active_overlap" EXCLUDE USING gist (
  "inventoryItemId" WITH =,
  tstzrange("rangeStartUtc", "rangeEndExclusiveUtc", '[)') WITH &&
) WHERE ("status" = 'ACTIVE') DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_order_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "RentalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationItem" ADD CONSTRAINT "InventoryReservationItem_reservation_fkey" FOREIGN KEY ("inventoryReservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationItem" ADD CONSTRAINT "InventoryReservationItem_order_item_fkey" FOREIGN KEY ("rentalOrderItemId") REFERENCES "RentalOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationItem" ADD CONSTRAINT "InventoryReservationItem_inventory_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationOperation" ADD CONSTRAINT "InventoryReservationOperation_reservation_fkey" FOREIGN KEY ("inventoryReservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationOperation" ADD CONSTRAINT "InventoryReservationOperation_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationOperationItem" ADD CONSTRAINT "InventoryReservationOperationItem_operation_fkey" FOREIGN KEY ("reservationOperationId") REFERENCES "InventoryReservationOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationOperationItem" ADD CONSTRAINT "InventoryReservationOperationItem_reservation_item_fkey" FOREIGN KEY ("reservationItemId") REFERENCES "InventoryReservationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservationOperationItem" ADD CONSTRAINT "InventoryReservationOperationItem_inventory_item_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_reservation_item_fkey" FOREIGN KEY ("reservationItemId") REFERENCES "InventoryReservationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_inventory_item_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_allocated_operation_fkey" FOREIGN KEY ("allocatedOperationId") REFERENCES "InventoryReservationOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_released_operation_fkey" FOREIGN KEY ("releasedOperationId") REFERENCES "InventoryReservationOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_allocator_fkey" FOREIGN KEY ("allocatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SerializedAssetAllocation" ADD CONSTRAINT "SerializedAssetAllocation_releaser_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An existing inclusive DATE order is normalized once into a UTC half-open range:
-- local start-date midnight through local midnight after the inclusive end date.
CREATE FUNCTION validate_inventory_reservation_identity() RETURNS trigger AS $$
DECLARE
  source_order "RentalOrder"%ROWTYPE;
  expected_start TIMESTAMPTZ;
  expected_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO source_order FROM "RentalOrder" WHERE "id" = NEW."rentalOrderId";
  IF NOT FOUND OR source_order."status" <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'Inventory reservation requires a confirmed rental order';
  END IF;
  IF NEW."rentalStartDateSnapshot" IS DISTINCT FROM source_order."rentalStartDateSnapshot" OR
     NEW."rentalEndDateSnapshot" IS DISTINCT FROM source_order."rentalEndDateSnapshot" OR
     NEW."requestedTimeZoneSnapshot" IS DISTINCT FROM source_order."requestedTimeZoneSnapshot" THEN
    RAISE EXCEPTION 'Reservation dates and timezone must snapshot the rental order';
  END IF;
  BEGIN
    expected_start := NEW."rentalStartDateSnapshot"::timestamp AT TIME ZONE NEW."requestedTimeZoneSnapshot";
    expected_end := (NEW."rentalEndDateSnapshot" + 1)::timestamp AT TIME ZONE NEW."requestedTimeZoneSnapshot";
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Reservation timezone is invalid';
  END;
  IF NEW."rangeStartUtc" IS DISTINCT FROM expected_start OR NEW."rangeEndExclusiveUtc" IS DISTINCT FROM expected_end THEN
    RAISE EXCEPTION 'Reservation UTC range is not the normalized inclusive-date snapshot';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservation_identity_guard"
BEFORE INSERT ON "InventoryReservation"
FOR EACH ROW EXECUTE FUNCTION validate_inventory_reservation_identity();

CREATE FUNCTION protect_inventory_reservation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory reservation history cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','version','updatedAt']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','version','updatedAt']) THEN
    RAISE EXCEPTION 'Inventory reservation identity and date snapshots are immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Inventory reservation version must increase by one';
  END IF;
  IF OLD."status" = 'RELEASED' AND NEW."status" <> 'RELEASED' THEN
    RAISE EXCEPTION 'A released reservation cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservation_protect"
BEFORE UPDATE OR DELETE ON "InventoryReservation"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_reservation();

CREATE FUNCTION validate_inventory_reservation_item() RETURNS trigger AS $$
DECLARE
  order_id TEXT;
  order_item "RentalOrderItem"%ROWTYPE;
  inventory_row "Inventory"%ROWTYPE;
  physical_rentable BIGINT;
  overlapping_reserved BIGINT;
BEGIN
  SELECT "rentalOrderId" INTO order_id FROM "InventoryReservation" WHERE "id" = NEW."inventoryReservationId";
  SELECT * INTO order_item FROM "RentalOrderItem" WHERE "id" = NEW."rentalOrderItemId";
  SELECT * INTO inventory_row FROM "Inventory" WHERE "id" = NEW."inventoryId";

  IF order_id IS NULL OR order_item."rentalOrderId" IS DISTINCT FROM order_id THEN
    RAISE EXCEPTION 'Reservation item must reference an item from the reserved order';
  END IF;
  IF NEW."requestedQuantity" <> order_item."quotedQuantity" OR NEW."productIdSnapshot" IS DISTINCT FROM order_item."productIdSnapshot" THEN
    RAISE EXCEPTION 'Reservation item must preserve the order item quantity and product';
  END IF;
  IF inventory_row."productId" IS DISTINCT FROM NEW."productIdSnapshot" OR
     NEW."reservationType"::text IS DISTINCT FROM inventory_row."trackingMode"::text THEN
    RAISE EXCEPTION 'Reservation item inventory does not match the ordered product or tracking mode';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."inventoryId", 0));

  IF NEW."reservationType" = 'BULK' AND NEW."reservedQuantity" > 0 THEN
    SELECT COALESCE(sum(
      CASE
        WHEN t."kind" = 'INITIAL_STOCK' AND t."toState" = 'RENTABLE' THEN t."quantity"
        WHEN t."kind" = 'BULK_MOVEMENT' AND t."toState" = 'RENTABLE' THEN t."quantity"
        WHEN t."kind" = 'BULK_MOVEMENT' AND t."fromState" = 'RENTABLE' THEN -t."quantity"
        ELSE 0
      END
    ), 0) INTO physical_rentable
    FROM "InventoryTransaction" t
    WHERE t."inventoryId" = NEW."inventoryId";

    SELECT COALESCE(sum(other_item."reservedQuantity"), 0) INTO overlapping_reserved
    FROM "InventoryReservationItem" other_item
    JOIN "InventoryReservation" other_reservation ON other_reservation."id" = other_item."inventoryReservationId"
    JOIN "InventoryReservation" requested_reservation ON requested_reservation."id" = NEW."inventoryReservationId"
    WHERE other_item."inventoryId" = NEW."inventoryId"
      AND other_item."id" <> NEW."id"
      AND other_reservation."status" NOT IN ('RELEASED', 'RESERVATION_FAILED')
      AND other_reservation."rangeStartUtc" < requested_reservation."rangeEndExclusiveUtc"
      AND requested_reservation."rangeStartUtc" < other_reservation."rangeEndExclusiveUtc";

    IF overlapping_reserved + NEW."reservedQuantity" > physical_rentable THEN
      RAISE EXCEPTION 'Bulk reservation would exceed rentable inventory for the requested range';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservationItem_validate"
BEFORE INSERT OR UPDATE ON "InventoryReservationItem"
FOR EACH ROW EXECUTE FUNCTION validate_inventory_reservation_item();

CREATE FUNCTION protect_inventory_reservation_item() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory reservation items cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['reservedQuantity','shortfallQuantity','updatedAt']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['reservedQuantity','shortfallQuantity','updatedAt']) THEN
    RAISE EXCEPTION 'Inventory reservation item identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservationItem_protect"
BEFORE UPDATE OR DELETE ON "InventoryReservationItem"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_reservation_item();

CREATE FUNCTION validate_inventory_reservation_operation() RETURNS trigger AS $$
DECLARE current_version INTEGER;
BEGIN
  SELECT "version" INTO current_version FROM "InventoryReservation" WHERE "id" = NEW."inventoryReservationId" FOR UPDATE;
  IF current_version IS DISTINCT FROM NEW."expectedVersion" THEN
    RAISE EXCEPTION 'Inventory reservation operation has a stale version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservationOperation_validate"
BEFORE INSERT ON "InventoryReservationOperation"
FOR EACH ROW EXECUTE FUNCTION validate_inventory_reservation_operation();

CREATE FUNCTION protect_inventory_reservation_history() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory reservation operation history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservationOperation_immutable"
BEFORE UPDATE OR DELETE ON "InventoryReservationOperation"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_reservation_history();
CREATE TRIGGER "InventoryReservationOperationItem_immutable"
BEFORE UPDATE OR DELETE ON "InventoryReservationOperationItem"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_reservation_history();

CREATE FUNCTION validate_reservation_operation_item() RETURNS trigger AS $$
DECLARE operation_reservation_id TEXT; item_reservation_id TEXT; item_type "InventoryReservationItemType"; item_inventory_id TEXT;
BEGIN
  SELECT "inventoryReservationId" INTO operation_reservation_id FROM "InventoryReservationOperation" WHERE "id" = NEW."reservationOperationId";
  SELECT "inventoryReservationId", "reservationType", "inventoryId" INTO item_reservation_id, item_type, item_inventory_id
  FROM "InventoryReservationItem" WHERE "id" = NEW."reservationItemId";
  IF operation_reservation_id IS DISTINCT FROM item_reservation_id THEN
    RAISE EXCEPTION 'Reservation operation item belongs to another reservation';
  END IF;
  IF item_type = 'SERIALIZED' AND (NEW."inventoryItemId" IS NULL OR abs(NEW."quantityDelta") <> 1) THEN
    RAISE EXCEPTION 'Serialized reservation deltas require exactly one asset';
  END IF;
  IF item_type = 'BULK' AND NEW."inventoryItemId" IS NOT NULL THEN
    RAISE EXCEPTION 'Bulk reservation deltas cannot reference a serialized asset';
  END IF;
  IF NEW."inventoryItemId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "InventoryItem" WHERE "id" = NEW."inventoryItemId" AND "inventoryId" = item_inventory_id
  ) THEN
    RAISE EXCEPTION 'Reservation operation asset does not match the reservation inventory';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryReservationOperationItem_validate"
BEFORE INSERT ON "InventoryReservationOperationItem"
FOR EACH ROW EXECUTE FUNCTION validate_reservation_operation_item();

CREATE FUNCTION validate_serialized_asset_allocation() RETURNS trigger AS $$
DECLARE
  reservation_row "InventoryReservation"%ROWTYPE;
  reservation_item_row "InventoryReservationItem"%ROWTYPE;
  allocation_operation "InventoryReservationOperation"%ROWTYPE;
  release_operation "InventoryReservationOperation"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO reservation_item_row FROM "InventoryReservationItem" WHERE "id" = NEW."reservationItemId";
    SELECT * INTO reservation_row FROM "InventoryReservation" WHERE "id" = reservation_item_row."inventoryReservationId";
    SELECT * INTO allocation_operation FROM "InventoryReservationOperation" WHERE "id" = NEW."allocatedOperationId";
    IF reservation_item_row."reservationType" <> 'SERIALIZED' OR
       allocation_operation."inventoryReservationId" IS DISTINCT FROM reservation_row."id" OR
       allocation_operation."actorUserId" IS DISTINCT FROM NEW."allocatedByUserId" OR
       NEW."rangeStartUtc" IS DISTINCT FROM reservation_row."rangeStartUtc" OR
       NEW."rangeEndExclusiveUtc" IS DISTINCT FROM reservation_row."rangeEndExclusiveUtc" THEN
      RAISE EXCEPTION 'Serialized allocation does not match its reservation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "InventoryItem"
      WHERE "id" = NEW."inventoryItemId" AND "inventoryId" = reservation_item_row."inventoryId" AND "status" = 'RENTABLE'
    ) THEN
      RAISE EXCEPTION 'Serialized asset is not rentable or does not match the ordered product';
    END IF;
  ELSE
    IF OLD."status" <> 'ACTIVE' OR NEW."status" <> 'RELEASED' OR
       (to_jsonb(NEW) - ARRAY['status','releasedOperationId','releasedAt','releasedByUserId']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','releasedOperationId','releasedAt','releasedByUserId']) THEN
      RAISE EXCEPTION 'Serialized allocation may only be released once';
    END IF;
    SELECT * INTO reservation_item_row FROM "InventoryReservationItem" WHERE "id" = NEW."reservationItemId";
    SELECT * INTO release_operation FROM "InventoryReservationOperation" WHERE "id" = NEW."releasedOperationId";
    IF release_operation."inventoryReservationId" IS DISTINCT FROM reservation_item_row."inventoryReservationId" OR
       release_operation."actorUserId" IS DISTINCT FROM NEW."releasedByUserId" THEN
      RAISE EXCEPTION 'Serialized release operation does not match its reservation or actor';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SerializedAssetAllocation_validate"
BEFORE INSERT OR UPDATE ON "SerializedAssetAllocation"
FOR EACH ROW EXECUTE FUNCTION validate_serialized_asset_allocation();

CREATE FUNCTION protect_serialized_asset_allocation_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Serialized allocation history cannot be deleted';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SerializedAssetAllocation_no_delete"
BEFORE DELETE ON "SerializedAssetAllocation"
FOR EACH ROW EXECUTE FUNCTION protect_serialized_asset_allocation_delete();

-- At commit, summaries must equal the immutable delta ledger; serialized summaries
-- must additionally equal the number of currently active asset allocations.
CREATE FUNCTION validate_reservation_item_ledger() RETURNS trigger AS $$
DECLARE target_item_id TEXT; summary "InventoryReservationItem"%ROWTYPE; delta_total BIGINT; active_assets BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'InventoryReservationItem' THEN target_item_id := NEW."id";
  ELSE target_item_id := NEW."reservationItemId"; END IF;
  SELECT * INTO summary FROM "InventoryReservationItem" WHERE "id" = target_item_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum("quantityDelta"), 0) INTO delta_total FROM "InventoryReservationOperationItem" WHERE "reservationItemId" = target_item_id;
  IF summary."reservedQuantity" <> delta_total THEN
    RAISE EXCEPTION 'Reservation item summary does not match its operation ledger';
  END IF;
  IF summary."reservationType" = 'SERIALIZED' THEN
    SELECT count(*) INTO active_assets FROM "SerializedAssetAllocation" WHERE "reservationItemId" = target_item_id AND "status" = 'ACTIVE';
    IF summary."reservedQuantity" <> active_assets THEN
      RAISE EXCEPTION 'Serialized reservation summary does not match active allocations';
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "InventoryReservationItem_ledger_consistency"
AFTER INSERT OR UPDATE ON "InventoryReservationItem" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_reservation_item_ledger();
CREATE CONSTRAINT TRIGGER "InventoryReservationOperationItem_ledger_consistency"
AFTER INSERT ON "InventoryReservationOperationItem" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_reservation_item_ledger();
CREATE CONSTRAINT TRIGGER "SerializedAssetAllocation_ledger_consistency"
AFTER INSERT OR UPDATE ON "SerializedAssetAllocation" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_reservation_item_ledger();

-- Confirmed orders remain commercially immutable. Only the reservation projection
-- and its optimistic-concurrency version may change, one version at a time.
CREATE OR REPLACE FUNCTION protect_rental_order_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Confirmed rental order history is append-only';
  END IF;
  IF TG_TABLE_NAME <> 'RentalOrder' THEN
    RAISE EXCEPTION 'Confirmed rental order history is append-only';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['reservationStatus','reservationVersion']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['reservationStatus','reservationVersion']) OR
     NEW."reservationVersion" <> OLD."reservationVersion" + 1 THEN
    RAISE EXCEPTION 'Only a versioned rental-order reservation status transition is allowed';
  END IF;
  IF NOT (
    (OLD."reservationStatus" = 'NOT_RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RESERVATION_FAILED')) OR
    (OLD."reservationStatus" = 'RESERVATION_FAILED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RESERVATION_FAILED')) OR
    (OLD."reservationStatus" = 'PARTIALLY_RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RELEASED')) OR
    (OLD."reservationStatus" = 'RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RELEASED')) OR
    (OLD."reservationStatus" = 'RELEASED' AND NEW."reservationStatus" = 'RELEASED')
  ) THEN
    RAISE EXCEPTION 'Invalid rental-order reservation status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_order_reservation_projection() RETURNS trigger AS $$
DECLARE order_id TEXT; order_status "RentalOrderReservationStatus"; reservation_status "InventoryReservationStatus";
BEGIN
  IF TG_TABLE_NAME = 'RentalOrder' THEN order_id := NEW."id"; ELSE order_id := NEW."rentalOrderId"; END IF;
  SELECT "reservationStatus" INTO order_status FROM "RentalOrder" WHERE "id" = order_id;
  SELECT "status" INTO reservation_status FROM "InventoryReservation" WHERE "rentalOrderId" = order_id;
  IF reservation_status IS NULL THEN
    IF order_status <> 'NOT_RESERVED' THEN RAISE EXCEPTION 'Order reservation projection has no reservation aggregate'; END IF;
  ELSIF reservation_status::text IS DISTINCT FROM order_status::text THEN
    RAISE EXCEPTION 'Order reservation status does not match the reservation aggregate';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "RentalOrder_reservation_projection"
AFTER UPDATE OF "reservationStatus", "reservationVersion" ON "RentalOrder" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_order_reservation_projection();
CREATE CONSTRAINT TRIGGER "InventoryReservation_order_projection"
AFTER INSERT OR UPDATE OF "status", "version" ON "InventoryReservation" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_order_reservation_projection();

-- A rentable bulk movement may not make any active reservation instant insolvent.
CREATE FUNCTION protect_bulk_inventory_reservations() RETURNS trigger AS $$
DECLARE current_rentable BIGINT; peak_reserved BIGINT;
BEGIN
  IF NEW."kind" <> 'BULK_MOVEMENT' OR NEW."fromState" <> 'RENTABLE' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."inventoryId", 0));
  SELECT COALESCE(sum(CASE
    WHEN "kind" = 'INITIAL_STOCK' AND "toState" = 'RENTABLE' THEN "quantity"
    WHEN "kind" = 'BULK_MOVEMENT' AND "toState" = 'RENTABLE' THEN "quantity"
    WHEN "kind" = 'BULK_MOVEMENT' AND "fromState" = 'RENTABLE' THEN -"quantity"
    ELSE 0 END), 0)
  INTO current_rentable FROM "InventoryTransaction" WHERE "inventoryId" = NEW."inventoryId";

  SELECT COALESCE(max((
    SELECT COALESCE(sum(i2."reservedQuantity"), 0)
    FROM "InventoryReservationItem" i2
    JOIN "InventoryReservation" r2 ON r2."id" = i2."inventoryReservationId"
    WHERE i2."inventoryId" = NEW."inventoryId"
      AND r2."status" NOT IN ('RELEASED','RESERVATION_FAILED')
      AND r2."rangeStartUtc" <= points."at"
      AND points."at" < r2."rangeEndExclusiveUtc"
  )), 0) INTO peak_reserved
  FROM (
    SELECT r."rangeStartUtc" AS "at"
    FROM "InventoryReservationItem" i
    JOIN "InventoryReservation" r ON r."id" = i."inventoryReservationId"
    WHERE i."inventoryId" = NEW."inventoryId" AND r."status" NOT IN ('RELEASED','RESERVATION_FAILED')
  ) points;

  IF current_rentable - NEW."quantity" < peak_reserved THEN
    RAISE EXCEPTION 'Bulk movement would invalidate active date-range reservations';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryTransaction_reservation_capacity_guard"
BEFORE INSERT ON "InventoryTransaction"
FOR EACH ROW EXECUTE FUNCTION protect_bulk_inventory_reservations();

CREATE FUNCTION protect_allocated_inventory_item_state() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'RENTABLE' AND NEW."status" <> 'RENTABLE' AND EXISTS (
    SELECT 1 FROM "SerializedAssetAllocation"
    WHERE "inventoryItemId" = OLD."id" AND "status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Serialized asset state change would invalidate an active reservation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryItem_active_reservation_guard"
BEFORE UPDATE OF "status" ON "InventoryItem"
FOR EACH ROW EXECUTE FUNCTION protect_allocated_inventory_item_state();
