-- Phase 18.3: additive inventory lifecycle and explicit ownership changes.
CREATE TYPE "InventoryAdjustmentReasonType" AS ENUM (
  'PURCHASE', 'ACQUISITION', 'SOLD', 'RETIRED', 'DISPOSED',
  'INVENTORY_CORRECTION', 'OTHER'
);

ALTER TABLE "Inventory"
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3);

ALTER TABLE "InventoryTransaction"
  ADD COLUMN "reasonType" "InventoryAdjustmentReasonType",
  ADD COLUMN "reference" VARCHAR(200);

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_lifecycle_check"
  CHECK (("isActive" AND "archivedAt" IS NULL) OR (NOT "isActive" AND "archivedAt" IS NOT NULL));
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_internal_notes_check"
  CHECK ("internalNotes" IS NULL OR length(trim("internalNotes")) BETWEEN 1 AND 3000);
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_reference_check"
  CHECK ("reference" IS NULL OR length(trim("reference")) BETWEEN 1 AND 200);
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_adjustment_reason_check"
  CHECK (
    ("kind" = 'STOCK_ADDITION' AND "reasonType" IN ('PURCHASE','ACQUISITION','OTHER')) OR
    ("kind" = 'STOCK_REDUCTION' AND "reasonType" IN ('SOLD','RETIRED','DISPOSED','INVENTORY_CORRECTION','OTHER')) OR
    ("kind" NOT IN ('STOCK_ADDITION','STOCK_REDUCTION') AND "reasonType" IS NULL AND "reference" IS NULL)
  );

ALTER TABLE "InventoryTransaction" DROP CONSTRAINT "InventoryTransaction_shape_check";
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_shape_check" CHECK (
  ("kind" = 'INITIAL_STOCK' AND "inventoryItemId" IS NULL AND "fromState" IS NULL AND "toState" IS NOT NULL) OR
  ("kind" = 'BULK_MOVEMENT' AND "inventoryItemId" IS NULL AND "fromState" IS NOT NULL AND "toState" IS NOT NULL) OR
  ("kind" = 'SERIALIZED_ITEM_CREATED' AND "inventoryItemId" IS NOT NULL AND "quantity" = 1 AND "fromState" IS NULL AND "toState" IS NOT NULL) OR
  ("kind" = 'SERIALIZED_ITEM_STATE_CHANGED' AND "inventoryItemId" IS NOT NULL AND "quantity" = 1 AND "fromState" IS NOT NULL AND "toState" IS NOT NULL) OR
  ("kind" = 'STOCK_ADDITION' AND "inventoryItemId" IS NULL AND "fromState" IS NULL AND "toState" = 'RENTABLE') OR
  ("kind" = 'STOCK_REDUCTION' AND "inventoryItemId" IS NULL AND "fromState" = 'RENTABLE' AND "toState" IS NULL)
);

DROP INDEX "Inventory_trackingMode_id_idx";
CREATE INDEX "Inventory_isActive_trackingMode_id_idx" ON "Inventory"("isActive", "trackingMode", "id");

CREATE OR REPLACE FUNCTION enforce_inventory_transaction_mode() RETURNS trigger AS $$
DECLARE mode "InventoryTrackingMode";
BEGIN
  SELECT "trackingMode" INTO mode FROM "Inventory" WHERE "id" = NEW."inventoryId";
  IF NEW."kind" IN ('INITIAL_STOCK', 'BULK_MOVEMENT', 'STOCK_ADDITION', 'STOCK_REDUCTION') AND mode <> 'BULK' THEN
    RAISE EXCEPTION 'Bulk transactions require BULK tracking mode';
  END IF;
  IF NEW."kind" IN ('SERIALIZED_ITEM_CREATED', 'SERIALIZED_ITEM_STATE_CHANGED') AND mode <> 'SERIALIZED' THEN
    RAISE EXCEPTION 'Serialized transactions require SERIALIZED tracking mode';
  END IF;
  IF NEW."inventoryItemId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "InventoryItem" WHERE "id" = NEW."inventoryItemId" AND "inventoryId" = NEW."inventoryId"
  ) THEN RAISE EXCEPTION 'Inventory item does not belong to inventory'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_bulk_inventory_reservations() RETURNS trigger AS $$
DECLARE current_rentable BIGINT; peak_reserved BIGINT;
BEGIN
  IF NEW."fromState" <> 'RENTABLE' OR NEW."kind" NOT IN ('BULK_MOVEMENT','STOCK_REDUCTION') THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."inventoryId", 0));
  SELECT COALESCE(sum(CASE WHEN "toState"='RENTABLE' THEN "quantity" ELSE 0 END),0)
       - COALESCE(sum(CASE WHEN "fromState"='RENTABLE' THEN "quantity" ELSE 0 END),0)
    INTO current_rentable FROM "InventoryTransaction" WHERE "inventoryId"=NEW."inventoryId";
  SELECT COALESCE(max((
    SELECT COALESCE(sum(i2."reservedQuantity"),0)
      FROM "InventoryReservationItem" i2
      JOIN "InventoryReservation" r2 ON r2."id"=i2."inventoryReservationId"
     WHERE i2."inventoryId"=NEW."inventoryId"
       AND r2."status" NOT IN ('RELEASED','RESERVATION_FAILED')
       AND r2."rangeStartUtc"<=points."at" AND points."at"<r2."rangeEndExclusiveUtc"
  )),0) INTO peak_reserved
  FROM (
    SELECT r."rangeStartUtc" AS "at"
      FROM "InventoryReservationItem" i
      JOIN "InventoryReservation" r ON r."id"=i."inventoryReservationId"
     WHERE i."inventoryId"=NEW."inventoryId" AND r."status" NOT IN ('RELEASED','RESERVATION_FAILED')
  ) points;
  IF current_rentable-NEW."quantity"<peak_reserved THEN
    RAISE EXCEPTION 'Bulk movement would invalidate active date-range reservations';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_inventory_archive() RETURNS trigger AS $$
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
      SELECT 1 FROM "InventoryReservationItem" i
      JOIN "InventoryReservation" r ON r."id"=i."inventoryReservationId"
      WHERE i."inventoryId"=OLD."id" AND r."status" NOT IN ('RELEASED','RESERVATION_FAILED')
    ) THEN RAISE EXCEPTION 'Inventory with active reservations cannot be archived'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Inventory_archive_guard" BEFORE UPDATE OF "isActive" ON "Inventory"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_archive();

CREATE FUNCTION protect_archived_inventory_reservation() RETURNS trigger AS $$
BEGIN
  IF NEW."inventoryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Inventory" WHERE "id"=NEW."inventoryId" AND "isActive"
  ) THEN RAISE EXCEPTION 'Archived inventory cannot receive a reservation'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryReservationItem_active_inventory_guard"
BEFORE INSERT OR UPDATE OF "inventoryId" ON "InventoryReservationItem"
FOR EACH ROW EXECUTE FUNCTION protect_archived_inventory_reservation();

-- Count every explicit RENTABLE entry/exit, including Phase 18.3 ownership
-- additions and reductions, when enforcing reservation capacity.
CREATE OR REPLACE FUNCTION validate_inventory_reservation_item() RETURNS trigger AS $$
DECLARE order_id TEXT; order_item "RentalOrderItem"%ROWTYPE; inventory_row "Inventory"%ROWTYPE; physical_rentable BIGINT; overlapping_reserved BIGINT;
BEGIN
  SELECT "rentalOrderId" INTO order_id FROM "InventoryReservation" WHERE "id"=NEW."inventoryReservationId";
  SELECT * INTO order_item FROM "RentalOrderItem" WHERE "id"=NEW."rentalOrderItemId";
  IF order_id IS NULL OR order_item."rentalOrderId" IS DISTINCT FROM order_id THEN RAISE EXCEPTION 'Reservation item must reference an item from the reserved order'; END IF;
  IF NEW."requestedQuantity"<>order_item."quotedQuantity" OR NEW."productIdSnapshot" IS DISTINCT FROM order_item."productIdSnapshot" THEN RAISE EXCEPTION 'Reservation item must preserve the order item quantity and product'; END IF;
  IF NEW."inventoryId" IS NULL THEN
    IF NEW."reservationType" IS NOT NULL OR NEW."reservedQuantity"<>0 OR NEW."consumedQuantity"<>0 THEN RAISE EXCEPTION 'An external-only reservation item cannot claim physical inventory'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO inventory_row FROM "Inventory" WHERE "id"=NEW."inventoryId";
  IF NOT FOUND OR NOT inventory_row."isActive" OR inventory_row."productId" IS DISTINCT FROM NEW."productIdSnapshot" OR NEW."reservationType"::text IS DISTINCT FROM inventory_row."trackingMode"::text THEN RAISE EXCEPTION 'Reservation item inventory is inactive or does not match the ordered product or tracking mode'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."inventoryId",0));
  IF NEW."reservationType"='BULK' AND NEW."reservedQuantity">0 THEN
    SELECT COALESCE(sum(CASE WHEN t."toState"='RENTABLE' THEN t."quantity" ELSE 0 END),0)
         - COALESCE(sum(CASE WHEN t."fromState"='RENTABLE' THEN t."quantity" ELSE 0 END),0)
      INTO physical_rentable FROM "InventoryTransaction" t WHERE t."inventoryId"=NEW."inventoryId";
    SELECT COALESCE(sum(i."reservedQuantity"),0) INTO overlapping_reserved
      FROM "InventoryReservationItem" i
      JOIN "InventoryReservation" r ON r."id"=i."inventoryReservationId"
      JOIN "InventoryReservation" requested ON requested."id"=NEW."inventoryReservationId"
     WHERE i."inventoryId"=NEW."inventoryId" AND i."id"<>NEW."id"
       AND r."status" NOT IN ('RELEASED','RESERVATION_FAILED')
       AND r."rangeStartUtc"<requested."rangeEndExclusiveUtc" AND requested."rangeStartUtc"<r."rangeEndExclusiveUtc";
    IF overlapping_reserved+NEW."reservedQuantity">physical_rentable THEN RAISE EXCEPTION 'Bulk reservation would exceed rentable inventory for the requested range'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
