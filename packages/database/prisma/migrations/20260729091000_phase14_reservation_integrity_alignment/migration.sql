-- Keep the database bound aligned with the shared reservation validation contract.
ALTER TABLE "InventoryReservationOperation"
  DROP CONSTRAINT "InventoryReservationOperation_reason_check";

ALTER TABLE "InventoryReservationOperation"
  ADD CONSTRAINT "InventoryReservationOperation_reason_check" CHECK (
    "reason" IS NULL OR length(trim("reason")) BETWEEN 1 AND 2000
  );
