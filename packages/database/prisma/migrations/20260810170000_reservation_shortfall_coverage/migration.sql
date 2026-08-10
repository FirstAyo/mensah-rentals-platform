-- Reservation shortfall coverage and source-aware fulfilment.
-- Physical Mensah inventory remains separate from approved external coverage.

ALTER TYPE "InventoryReservationStatus" ADD VALUE IF NOT EXISTS 'NOT_RESERVED' BEFORE 'PARTIALLY_RESERVED';
ALTER TYPE "InventoryReservationOperationType" ADD VALUE IF NOT EXISTS 'SHORTFALL_IDENTIFIED';
ALTER TYPE "InventoryReservationOperationType" ADD VALUE IF NOT EXISTS 'SHORTFALL_ACKNOWLEDGED';
ALTER TYPE "InventoryReservationOperationType" ADD VALUE IF NOT EXISTS 'SHORTFALL_PLAN_UPDATED';
ALTER TYPE "InventoryReservationOperationType" ADD VALUE IF NOT EXISTS 'SHORTFALL_RESOLVED';

CREATE TYPE "InventoryReservationCoverageStatus" AS ENUM ('FULLY_INTERNAL','SHORTFALL_REQUIRES_PLAN','SHORTFALL_ACKNOWLEDGED');
CREATE TYPE "ReservationShortfallStatus" AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED');
CREATE TYPE "ReservationShortfallResolutionType" AS ENUM ('SUBRENT','PARTNER_SOURCE','TRANSFER','OTHER');

ALTER TABLE "InventoryReservation"
  ADD COLUMN "coverageStatus" "InventoryReservationCoverageStatus" NOT NULL DEFAULT 'SHORTFALL_REQUIRES_PLAN';

ALTER TABLE "InventoryReservationItem" ALTER COLUMN "inventoryId" DROP NOT NULL;
ALTER TABLE "InventoryReservationItem" ALTER COLUMN "reservationType" DROP NOT NULL;
ALTER TABLE "InventoryReservationItem" ADD CONSTRAINT "InventoryReservationItem_inventory_shape_check" CHECK (
  (("inventoryId" IS NULL) = ("reservationType" IS NULL)) AND
  ("inventoryId" IS NOT NULL OR ("reservedQuantity"=0 AND "consumedQuantity"=0))
);

CREATE TABLE "ReservationShortfall" (
  "id" TEXT PRIMARY KEY,
  "reservationItemId" TEXT NOT NULL UNIQUE,
  "status" "ReservationShortfallStatus" NOT NULL DEFAULT 'OPEN',
  "resolutionType" "ReservationShortfallResolutionType",
  "acknowledgedQuantity" INTEGER NOT NULL DEFAULT 0,
  "resolutionNote" TEXT,
  "acknowledgedByUserId" TEXT,
  "acknowledgedAt" TIMESTAMPTZ(3),
  "resolvedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReservationShortfall_item_fkey" FOREIGN KEY ("reservationItemId") REFERENCES "InventoryReservationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReservationShortfall_actor_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReservationShortfall_version_check" CHECK ("version">=0),
  CONSTRAINT "ReservationShortfall_shape_check" CHECK (
    ("status"='OPEN' AND "resolutionType" IS NULL AND "acknowledgedQuantity"=0 AND "resolutionNote" IS NULL AND "acknowledgedByUserId" IS NULL AND "acknowledgedAt" IS NULL AND "resolvedAt" IS NULL) OR
    ("status"='ACKNOWLEDGED' AND "resolutionType" IS NOT NULL AND "acknowledgedQuantity">0 AND length(trim("resolutionNote")) BETWEEN 1 AND 2000 AND "acknowledgedByUserId" IS NOT NULL AND "acknowledgedAt" IS NOT NULL AND "resolvedAt" IS NULL) OR
    ("status"='RESOLVED' AND "resolutionType" IS NOT NULL AND "acknowledgedQuantity">0 AND length(trim("resolutionNote")) BETWEEN 1 AND 2000 AND "acknowledgedByUserId" IS NOT NULL AND "acknowledgedAt" IS NOT NULL AND "resolvedAt" IS NOT NULL)
  )
);
CREATE INDEX "ReservationShortfall_status_reservationItemId_idx" ON "ReservationShortfall"("status","reservationItemId");
CREATE INDEX "ReservationShortfall_acknowledgedByUserId_acknowledgedAt_id_idx" ON "ReservationShortfall"("acknowledgedByUserId","acknowledgedAt","id");

-- Existing intentional partial reservations already contain a durable actor and reason.
INSERT INTO "ReservationShortfall" (
  "id","reservationItemId","status","resolutionType","acknowledgedQuantity","resolutionNote",
  "acknowledgedByUserId","acknowledgedAt","version","createdAt","updatedAt"
)
SELECT
  'legacy_' || md5(i."id"), i."id",
  CASE WHEN op."reason" IS NOT NULL AND length(trim(op."reason"))>0 THEN 'ACKNOWLEDGED'::"ReservationShortfallStatus" ELSE 'OPEN'::"ReservationShortfallStatus" END,
  CASE WHEN op."reason" IS NOT NULL AND length(trim(op."reason"))>0 THEN 'OTHER'::"ReservationShortfallResolutionType" ELSE NULL END,
  CASE WHEN op."reason" IS NOT NULL AND length(trim(op."reason"))>0 THEN i."shortfallQuantity" ELSE 0 END,
  CASE WHEN op."reason" IS NOT NULL AND length(trim(op."reason"))>0 THEN trim(op."reason") ELSE NULL END,
  CASE WHEN op."reason" IS NOT NULL AND length(trim(op."reason"))>0 THEN op."actorUserId" ELSE NULL END,
  CASE WHEN op."reason" IS NOT NULL AND length(trim(op."reason"))>0 THEN op."createdAt" ELSE NULL END,
  0, i."createdAt", CURRENT_TIMESTAMP
FROM "InventoryReservationItem" i
LEFT JOIN LATERAL (
  SELECT o."reason",o."actorUserId",o."createdAt"
  FROM "InventoryReservationOperation" o
  WHERE o."inventoryReservationId"=i."inventoryReservationId" AND o."reason" IS NOT NULL
  ORDER BY o."createdAt" DESC,o."id" DESC LIMIT 1
) op ON TRUE
WHERE i."shortfallQuantity">0;

-- The Phase 14 append-only trigger predates coverageStatus. Teach it about the
-- new mutable projection before backfilling existing reservations.
CREATE OR REPLACE FUNCTION protect_inventory_reservation() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inventory reservation history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','coverageStatus','version','updatedAt']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','coverageStatus','version','updatedAt']) THEN
    RAISE EXCEPTION 'Inventory reservation identity and date snapshots are immutable';
  END IF;
  IF NEW."version"<>OLD."version" AND NEW."version"<>OLD."version"+1 THEN
    RAISE EXCEPTION 'Inventory reservation version must increase by one';
  END IF;
  IF OLD."status"='RELEASED' AND NEW."status"<>'RELEASED' THEN RAISE EXCEPTION 'A released reservation cannot be reactivated'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

UPDATE "InventoryReservation" r SET "coverageStatus"=CASE
  WHEN NOT EXISTS (SELECT 1 FROM "InventoryReservationItem" i WHERE i."inventoryReservationId"=r."id" AND i."shortfallQuantity">0) THEN 'FULLY_INTERNAL'::"InventoryReservationCoverageStatus"
  WHEN NOT EXISTS (
    SELECT 1 FROM "InventoryReservationItem" i LEFT JOIN "ReservationShortfall" s ON s."reservationItemId"=i."id"
    WHERE i."inventoryReservationId"=r."id" AND i."shortfallQuantity">0
      AND (s."status" NOT IN ('ACKNOWLEDGED','RESOLVED') OR s."acknowledgedQuantity"<i."shortfallQuantity")
  ) THEN 'SHORTFALL_ACKNOWLEDGED'::"InventoryReservationCoverageStatus"
  ELSE 'SHORTFALL_REQUIRES_PLAN'::"InventoryReservationCoverageStatus" END;

ALTER TABLE "OrderFulfilmentItem"
  ADD COLUMN "internalCheckedOutQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "externalCheckedOutQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderFulfilmentItem" DISABLE TRIGGER USER;
UPDATE "OrderFulfilmentItem" SET "internalCheckedOutQuantity"="checkedOutQuantity";
ALTER TABLE "OrderFulfilmentItem" DROP CONSTRAINT "OrderFulfilmentItem_quantity_check";
ALTER TABLE "OrderFulfilmentItem" ADD CONSTRAINT "OrderFulfilmentItem_quantity_check" CHECK (
  "orderedQuantitySnapshot">0 AND "preparedQuantity">=0 AND "internalCheckedOutQuantity">=0 AND "externalCheckedOutQuantity">=0 AND
  "checkedOutQuantity"="internalCheckedOutQuantity"+"externalCheckedOutQuantity" AND "checkedOutQuantity"<="orderedQuantitySnapshot"
);
ALTER TABLE "OrderFulfilmentItem" ENABLE TRIGGER USER;

ALTER TABLE "FulfilmentOperationItem"
  ADD COLUMN "internalCheckedOutDelta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "externalCheckedOutDelta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FulfilmentOperationItem" DISABLE TRIGGER USER;
UPDATE "FulfilmentOperationItem" SET "internalCheckedOutDelta"="checkedOutDelta";
ALTER TABLE "FulfilmentOperationItem" DROP CONSTRAINT "FulfilmentOperationItem_delta_check";
ALTER TABLE "FulfilmentOperationItem" ADD CONSTRAINT "FulfilmentOperationItem_delta_check" CHECK (
  "checkedOutDelta"="internalCheckedOutDelta"+"externalCheckedOutDelta" AND
  ("preparedDelta"<>0 OR "checkedOutDelta"<>0)
);
ALTER TABLE "FulfilmentOperationItem" ENABLE TRIGGER USER;

ALTER TABLE "ActiveRentalItem"
  ADD COLUMN "internalCheckedOutQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "externalCheckedOutQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ActiveRentalItem" DISABLE TRIGGER USER;
UPDATE "ActiveRentalItem" SET "internalCheckedOutQuantity"="checkedOutQuantity";
ALTER TABLE "ActiveRentalItem" DROP CONSTRAINT "ActiveRentalItem_quantity_check";
ALTER TABLE "ActiveRentalItem" ADD CONSTRAINT "ActiveRentalItem_quantity_check" CHECK (
  "checkedOutQuantity">0 AND "internalCheckedOutQuantity">=0 AND "externalCheckedOutQuantity">=0 AND
  "checkedOutQuantity"="internalCheckedOutQuantity"+"externalCheckedOutQuantity"
);
ALTER TABLE "ActiveRentalItem" ENABLE TRIGGER USER;

ALTER TABLE "RentalReturnItem"
  ADD COLUMN "expectedInternalQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "expectedExternalQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "externalReceivedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "externalMissingQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "externalOutstandingQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RentalReturnItem" DISABLE TRIGGER USER;
UPDATE "RentalReturnItem" ri SET
  "expectedInternalQuantity"=ai."internalCheckedOutQuantity",
  "expectedExternalQuantity"=ai."externalCheckedOutQuantity",
  "externalOutstandingQuantity"=ai."externalCheckedOutQuantity"
FROM "ActiveRentalItem" ai WHERE ai."id"=ri."activeRentalItemId";
ALTER TABLE "RentalReturnItem" DROP CONSTRAINT "RentalReturnItem_quantities_check";
ALTER TABLE "RentalReturnItem" ADD CONSTRAINT "RentalReturnItem_quantities_check" CHECK (
  "expectedCheckedOutQuantity">0 AND "expectedInternalQuantity">=0 AND "expectedExternalQuantity">=0 AND
  "expectedCheckedOutQuantity"="expectedInternalQuantity"+"expectedExternalQuantity" AND
  "receivedQuantity">=0 AND "rentableQuantity">=0 AND "damagedQuantity">=0 AND "maintenanceQuantity">=0 AND "missingQuantity">=0 AND "outstandingQuantity">=0 AND
  "externalReceivedQuantity">=0 AND "externalMissingQuantity">=0 AND "externalOutstandingQuantity">=0 AND
  "receivedQuantity"="rentableQuantity"+"damagedQuantity"+"maintenanceQuantity"+"externalReceivedQuantity" AND
  "expectedCheckedOutQuantity"="receivedQuantity"+"missingQuantity"+"outstandingQuantity" AND
  "expectedExternalQuantity"="externalReceivedQuantity"+"externalMissingQuantity"+"externalOutstandingQuantity" AND
  "externalMissingQuantity"<="missingQuantity" AND "externalOutstandingQuantity"<="outstandingQuantity"
);
ALTER TABLE "RentalReturnItem" ENABLE TRIGGER USER;

ALTER TABLE "RentalReturnOperationItem"
  ADD COLUMN "externalQuantityReceived" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "externalQuantityMissing" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RentalReturnOperationItem" DROP CONSTRAINT "RentalReturnOperationItem_quantities_check";
ALTER TABLE "RentalReturnOperationItem" ADD CONSTRAINT "RentalReturnOperationItem_quantities_check" CHECK (
  "quantityReceived">=0 AND "quantityRentable">=0 AND "quantityDamaged">=0 AND "quantityMaintenance">=0 AND "quantityMissing">=0 AND
  "externalQuantityReceived">=0 AND "externalQuantityMissing">=0 AND
  "quantityReceived"="quantityRentable"+"quantityDamaged"+"quantityMaintenance"+"externalQuantityReceived" AND
  "externalQuantityMissing"<="quantityMissing" AND "quantityReceived"+"quantityMissing">0
);

CREATE OR REPLACE FUNCTION protect_rental_order_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME <> 'RentalOrder' THEN
    RAISE EXCEPTION 'Confirmed rental order history is append-only';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['reservationStatus','reservationVersion']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['reservationStatus','reservationVersion']) OR
     NEW."reservationVersion" <> OLD."reservationVersion" + 1 THEN
    RAISE EXCEPTION 'Only a versioned rental-order reservation status transition is allowed';
  END IF;
  IF NOT (
    (OLD."reservationStatus" = 'NOT_RESERVED' AND NEW."reservationStatus" IN ('NOT_RESERVED','PARTIALLY_RESERVED','RESERVED','RESERVATION_FAILED')) OR
    (OLD."reservationStatus" = 'RESERVATION_FAILED' AND NEW."reservationStatus" IN ('NOT_RESERVED','PARTIALLY_RESERVED','RESERVED','RESERVATION_FAILED')) OR
    (OLD."reservationStatus" = 'PARTIALLY_RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RELEASED','PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus" = 'RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED','RESERVED','RELEASED','PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus" = 'PARTIALLY_CONSUMED' AND NEW."reservationStatus" IN ('PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus" = 'CONSUMED' AND NEW."reservationStatus" IN ('PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus" = 'RELEASED' AND NEW."reservationStatus" = 'RELEASED')
  ) THEN
    RAISE EXCEPTION 'Invalid rental-order reservation status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_inventory_reservation() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inventory reservation history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','coverageStatus','version','updatedAt']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','coverageStatus','version','updatedAt']) THEN
    RAISE EXCEPTION 'Inventory reservation identity and date snapshots are immutable';
  END IF;
  IF NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Inventory reservation version must increase by one'; END IF;
  IF OLD."status"='RELEASED' AND NEW."status"<>'RELEASED' THEN RAISE EXCEPTION 'A released reservation cannot be reactivated'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

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
  IF NOT FOUND OR inventory_row."productId" IS DISTINCT FROM NEW."productIdSnapshot" OR NEW."reservationType"::text IS DISTINCT FROM inventory_row."trackingMode"::text THEN RAISE EXCEPTION 'Reservation item inventory does not match the ordered product or tracking mode'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."inventoryId",0));
  IF NEW."reservationType"='BULK' AND NEW."reservedQuantity">0 THEN
    SELECT COALESCE(sum(CASE WHEN t."kind"='INITIAL_STOCK' AND t."toState"='RENTABLE' THEN t."quantity" WHEN t."kind"='BULK_MOVEMENT' AND t."toState"='RENTABLE' THEN t."quantity" WHEN t."kind"='BULK_MOVEMENT' AND t."fromState"='RENTABLE' THEN -t."quantity" ELSE 0 END),0) INTO physical_rentable FROM "InventoryTransaction" t WHERE t."inventoryId"=NEW."inventoryId";
    SELECT COALESCE(sum(i."reservedQuantity"),0) INTO overlapping_reserved FROM "InventoryReservationItem" i JOIN "InventoryReservation" r ON r."id"=i."inventoryReservationId" JOIN "InventoryReservation" requested ON requested."id"=NEW."inventoryReservationId" WHERE i."inventoryId"=NEW."inventoryId" AND i."id"<>NEW."id" AND r."status" NOT IN ('RELEASED','RESERVATION_FAILED') AND r."rangeStartUtc"<requested."rangeEndExclusiveUtc" AND requested."rangeStartUtc"<r."rangeEndExclusiveUtc";
    IF overlapping_reserved+NEW."reservedQuantity">physical_rentable THEN RAISE EXCEPTION 'Bulk reservation would exceed rentable inventory for the requested range'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_inventory_reservation_aggregate() RETURNS trigger AS $$
DECLARE reservation_id TEXT; r "InventoryReservation"%ROWTYPE; order_count INTEGER; item_count INTEGER; total_reserved BIGINT; total_consumed BIGINT; total_shortfall BIGINT; uncovered BIGINT; ever_allocated BOOLEAN;
BEGIN
  reservation_id:=CASE WHEN TG_TABLE_NAME='InventoryReservation' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'inventoryReservationId' END;
  SELECT * INTO r FROM "InventoryReservation" WHERE "id"=reservation_id; IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO order_count FROM "RentalOrderItem" WHERE "rentalOrderId"=r."rentalOrderId";
  SELECT count(*),COALESCE(sum("reservedQuantity"),0),COALESCE(sum("consumedQuantity"),0),COALESCE(sum("shortfallQuantity"),0) INTO item_count,total_reserved,total_consumed,total_shortfall FROM "InventoryReservationItem" WHERE "inventoryReservationId"=reservation_id;
  IF item_count<>order_count OR item_count=0 THEN RAISE EXCEPTION 'Reservation must contain one item for every rental order item'; END IF;
  SELECT COALESCE(sum(GREATEST(i."shortfallQuantity"-CASE WHEN s."status" IN ('ACKNOWLEDGED','RESOLVED') THEN s."acknowledgedQuantity" ELSE 0 END,0)),0) INTO uncovered FROM "InventoryReservationItem" i LEFT JOIN "ReservationShortfall" s ON s."reservationItemId"=i."id" WHERE i."inventoryReservationId"=reservation_id;
  SELECT EXISTS(SELECT 1 FROM "InventoryReservationOperationItem" oi JOIN "InventoryReservationOperation" op ON op."id"=oi."reservationOperationId" WHERE op."inventoryReservationId"=reservation_id AND oi."quantityDelta">0) INTO ever_allocated;
  IF r."coverageStatus"='FULLY_INTERNAL' AND total_shortfall<>0 THEN RAISE EXCEPTION 'Fully internal coverage cannot contain a shortfall';
  ELSIF r."coverageStatus"='SHORTFALL_ACKNOWLEDGED' AND (total_shortfall<=0 OR uncovered<>0) THEN RAISE EXCEPTION 'Acknowledged coverage requires a plan for every shortfall';
  ELSIF r."coverageStatus"='SHORTFALL_REQUIRES_PLAN' AND total_shortfall<=0 THEN RAISE EXCEPTION 'Open coverage requires a physical shortfall'; END IF;
  IF r."status"='NOT_RESERVED' AND (total_reserved<>0 OR total_consumed<>0 OR total_shortfall<=0) THEN RAISE EXCEPTION 'Not-reserved aggregate may contain only shortfall';
  ELSIF r."status"='RESERVED' AND (total_shortfall<>0 OR total_consumed<>0) THEN RAISE EXCEPTION 'Reserved aggregate cannot contain shortfall or consumption';
  ELSIF r."status"='PARTIALLY_RESERVED' AND (total_reserved<=0 OR total_shortfall<=0 OR total_consumed<>0) THEN RAISE EXCEPTION 'Partial reservation requires allocations and shortfall only';
  ELSIF r."status"='PARTIALLY_CONSUMED' AND (total_consumed<=0 OR total_reserved<=0) THEN RAISE EXCEPTION 'Partial consumption requires consumed and active reserved quantity';
  ELSIF r."status"='CONSUMED' AND (total_consumed<=0 OR total_reserved<>0) THEN RAISE EXCEPTION 'Consumed reservation cannot retain active reserved quantity';
  ELSIF r."status"='RESERVATION_FAILED' AND (total_reserved<>0 OR total_consumed<>0) THEN RAISE EXCEPTION 'Failed reservation cannot retain allocations';
  ELSIF r."status"='RELEASED' AND (total_reserved<>0 OR total_consumed<>0 OR NOT ever_allocated) THEN RAISE EXCEPTION 'Released reservation must have no active or consumed quantity'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_reservation_shortfall() RETURNS trigger AS $$
DECLARE item "InventoryReservationItem"%ROWTYPE;
BEGIN
  SELECT * INTO item FROM "InventoryReservationItem" WHERE "id"=NEW."reservationItemId";
  IF NOT FOUND OR (NEW."status"='ACKNOWLEDGED' AND NEW."acknowledgedQuantity">item."shortfallQuantity") OR NEW."acknowledgedQuantity">item."requestedQuantity" THEN RAISE EXCEPTION 'Shortfall acknowledgement exceeds the current physical shortfall'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW."reservationItemId"<>OLD."reservationItemId" OR NEW."createdAt"<>OLD."createdAt" OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'Shortfall plan identity is immutable and updates must be versioned'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ReservationShortfall_validate" BEFORE INSERT OR UPDATE ON "ReservationShortfall" FOR EACH ROW EXECUTE FUNCTION validate_reservation_shortfall();
CREATE FUNCTION protect_reservation_shortfall_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Reservation shortfall history cannot be deleted'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ReservationShortfall_no_delete" BEFORE DELETE ON "ReservationShortfall" FOR EACH ROW EXECUTE FUNCTION protect_reservation_shortfall_delete();

CREATE CONSTRAINT TRIGGER "ReservationShortfall_aggregate_guard" AFTER INSERT OR UPDATE ON "ReservationShortfall" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_reservation_aggregate();

CREATE OR REPLACE FUNCTION validate_fulfilment_aggregate() RETURNS trigger AS $$
DECLARE f "OrderFulfilmentItem"%ROWTYPE; r "InventoryReservationItem"%ROWTYPE;
BEGIN
  SELECT * INTO f FROM "OrderFulfilmentItem" WHERE "id"=COALESCE(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id'); IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO r FROM "InventoryReservationItem" WHERE "id"=f."reservationItemId";
  IF f."internalCheckedOutQuantity"<>r."consumedQuantity" THEN RAISE EXCEPTION 'Internal checkout must match physical reservation consumption'; END IF;
  IF f."checkedOutQuantity"<>f."internalCheckedOutQuantity"+f."externalCheckedOutQuantity" THEN RAISE EXCEPTION 'Fulfilment source totals are inconsistent'; END IF;
  IF f."preparedQuantity">r."reservedQuantity" THEN RAISE EXCEPTION 'Prepared quantity cannot exceed active reserved quantity'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_phase16_return_identity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RentalReturnItem" ri JOIN "RentalReturn" r ON r."id"=ri."rentalReturnId" JOIN "ActiveRentalItem" ai ON ai."id"=ri."activeRentalItemId" WHERE ai."activeRentalId"<>r."activeRentalId" OR ri."expectedCheckedOutQuantity"<>ai."checkedOutQuantity" OR ri."expectedInternalQuantity"<>ai."internalCheckedOutQuantity" OR ri."expectedExternalQuantity"<>ai."externalCheckedOutQuantity") THEN RAISE EXCEPTION 'Return item must snapshot its active rental item and fulfilment sources'; END IF;
  IF EXISTS (SELECT 1 FROM "RentalReturnOperationItem" oi JOIN "RentalReturnOperation" o ON o."id"=oi."returnOperationId" JOIN "RentalReturnItem" ri ON ri."id"=oi."rentalReturnItemId" WHERE ri."rentalReturnId"<>o."rentalReturnId") THEN RAISE EXCEPTION 'Return operation item must belong to the same return'; END IF;
  IF EXISTS (SELECT 1 FROM "ReturnedSerializedAsset" rsa JOIN "RentalReturnOperationItem" oi ON oi."id"=rsa."returnOperationItemId" JOIN "RentalReturnItem" ri ON ri."id"=oi."rentalReturnItemId" JOIN "ActiveRentalSerializedAsset" asa ON asa."id"=rsa."activeRentalSerializedAssetId" WHERE asa."activeRentalItemId"<>ri."activeRentalItemId" OR asa."inventoryItemId"<>rsa."inventoryItemId") THEN RAISE EXCEPTION 'Returned serialized asset must match its checkout occurrence'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ActiveRentalItem_return_freeze" ON "ActiveRentalItem";
CREATE TRIGGER "ActiveRentalItem_return_freeze" BEFORE UPDATE OF "checkedOutQuantity","internalCheckedOutQuantity","externalCheckedOutQuantity" ON "ActiveRentalItem" FOR EACH ROW WHEN (NEW."checkedOutQuantity"<>OLD."checkedOutQuantity" OR NEW."internalCheckedOutQuantity"<>OLD."internalCheckedOutQuantity" OR NEW."externalCheckedOutQuantity"<>OLD."externalCheckedOutQuantity") EXECUTE FUNCTION freeze_active_rental_item_after_return();
