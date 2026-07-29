-- Preserve the exact current prepared serialized-asset selection. Append-only
-- FulfilmentOperationItem rows retain the change history.
CREATE TABLE "PreparedSerializedAsset" (
  "id" TEXT PRIMARY KEY,
  "orderFulfilmentItemId" TEXT NOT NULL,
  "serializedAllocationId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreparedSerializedAsset_fulfilment_item_fkey"
    FOREIGN KEY ("orderFulfilmentItemId") REFERENCES "OrderFulfilmentItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PreparedSerializedAsset_allocation_fkey"
    FOREIGN KEY ("serializedAllocationId") REFERENCES "SerializedAssetAllocation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PreparedSerializedAsset_item_allocation_key"
    UNIQUE ("orderFulfilmentItemId", "serializedAllocationId")
);

CREATE INDEX "PreparedSerializedAsset_item_idx"
  ON "PreparedSerializedAsset"("orderFulfilmentItemId", "id");

-- Pickup handoff evidence is never valid without a named recipient.
ALTER TABLE "FulfilmentHandoff"
  ADD CONSTRAINT "FulfilmentHandoff_pickup_recipient_check"
  CHECK ("type" <> 'PICKUP' OR "recipientName" IS NOT NULL);

-- Validate all denormalized Phase 15 identities together at transaction end.
-- This allows the service to build a checkout graph in any safe statement order
-- while preventing cross-order evidence from ever committing.
CREATE FUNCTION validate_phase15_fulfilment_identity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OrderFulfilment" f
    JOIN "InventoryReservation" r ON r."id" = f."inventoryReservationId"
    WHERE r."rentalOrderId" <> f."rentalOrderId"
  ) THEN
    RAISE EXCEPTION 'Fulfilment reservation must belong to the same rental order';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "OrderFulfilmentItem" fi
    JOIN "OrderFulfilment" f ON f."id" = fi."orderFulfilmentId"
    JOIN "RentalOrderItem" oi ON oi."id" = fi."rentalOrderItemId"
    JOIN "InventoryReservationItem" ri ON ri."id" = fi."reservationItemId"
    WHERE oi."rentalOrderId" <> f."rentalOrderId"
       OR ri."inventoryReservationId" <> f."inventoryReservationId"
       OR ri."rentalOrderItemId" <> fi."rentalOrderItemId"
  ) THEN
    RAISE EXCEPTION 'Fulfilment item must match its order and reservation item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "FulfilmentOperationItem" oi
    JOIN "FulfilmentOperation" o ON o."id" = oi."fulfilmentOperationId"
    JOIN "OrderFulfilmentItem" fi ON fi."id" = oi."orderFulfilmentItemId"
    LEFT JOIN "SerializedAssetAllocation" a
      ON a."id" = oi."serializedAllocationId"
    WHERE o."orderFulfilmentId" <> fi."orderFulfilmentId"
       OR (oi."serializedAllocationId" IS NOT NULL
           AND a."reservationItemId" <> fi."reservationItemId")
  ) THEN
    RAISE EXCEPTION 'Fulfilment operation item must match its fulfilment and reservation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PreparedSerializedAsset" p
    JOIN "OrderFulfilmentItem" fi ON fi."id" = p."orderFulfilmentItemId"
    JOIN "SerializedAssetAllocation" a ON a."id" = p."serializedAllocationId"
    WHERE a."reservationItemId" <> fi."reservationItemId"
       OR a."status" <> 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Prepared serialized asset must be active and match its fulfilment item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "OrderFulfilmentItem" fi
    JOIN "InventoryReservationItem" ri ON ri."id" = fi."reservationItemId"
    LEFT JOIN "PreparedSerializedAsset" p
      ON p."orderFulfilmentItemId" = fi."id"
    GROUP BY fi."id", fi."preparedQuantity", ri."reservationType"
    HAVING (ri."reservationType" = 'SERIALIZED'
            AND count(p."id") <> fi."preparedQuantity")
        OR (ri."reservationType" = 'BULK' AND count(p."id") <> 0)
  ) THEN
    RAISE EXCEPTION 'Prepared serialized asset count must match prepared quantity';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ActiveRental" ar
    JOIN "OrderFulfilment" f ON f."id" = ar."orderFulfilmentId"
    WHERE ar."rentalOrderId" <> f."rentalOrderId"
  ) THEN
    RAISE EXCEPTION 'Active rental must match its order fulfilment';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ActiveRentalItem" ari
    JOIN "ActiveRental" ar ON ar."id" = ari."activeRentalId"
    JOIN "OrderFulfilmentItem" fi ON fi."id" = ari."orderFulfilmentItemId"
    WHERE fi."orderFulfilmentId" <> ar."orderFulfilmentId"
       OR ari."rentalOrderItemId" <> fi."rentalOrderItemId"
  ) THEN
    RAISE EXCEPTION 'Active rental item must match its rental and fulfilment item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ActiveRentalSerializedAsset" asa
    JOIN "ActiveRentalItem" ari ON ari."id" = asa."activeRentalItemId"
    JOIN "OrderFulfilmentItem" fi ON fi."id" = ari."orderFulfilmentItemId"
    JOIN "SerializedAssetAllocation" a ON a."id" = asa."serializedAllocationId"
    WHERE a."reservationItemId" <> fi."reservationItemId"
       OR a."inventoryItemId" <> asa."inventoryItemId"
  ) THEN
    RAISE EXCEPTION 'Active rental serialized asset must match its allocation and fulfilment item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "FulfilmentHandoff" h
    JOIN "ActiveRental" ar ON ar."id" = h."activeRentalId"
    JOIN "FulfilmentOperation" o ON o."id" = h."fulfilmentOperationId"
    WHERE o."orderFulfilmentId" <> ar."orderFulfilmentId"
       OR o."type" <> 'CHECKOUT'
  ) THEN
    RAISE EXCEPTION 'Handoff operation must be checkout for the active rental fulfilment';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'OrderFulfilment',
    'OrderFulfilmentItem',
    'FulfilmentOperation',
    'FulfilmentOperationItem',
    'PreparedSerializedAsset',
    'ActiveRental',
    'ActiveRentalItem',
    'ActiveRentalSerializedAsset',
    'FulfilmentHandoff'
  ]
  LOOP
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_phase15_fulfilment_identity()',
      table_name || '_phase15_identity_guard',
      table_name
    );
  END LOOP;
END;
$$;

CREATE CONSTRAINT TRIGGER "PreparedSerializedAsset_phase15_delete_guard"
AFTER DELETE ON "PreparedSerializedAsset"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_phase15_fulfilment_identity();

CREATE CONSTRAINT TRIGGER "SerializedAssetAllocation_phase15_prepared_guard"
AFTER UPDATE OF "status" ON "SerializedAssetAllocation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_phase15_fulfilment_identity();
