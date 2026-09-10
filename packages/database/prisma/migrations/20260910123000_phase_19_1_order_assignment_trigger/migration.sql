-- Permit only two narrowly versioned RentalOrder mutations:
-- reservation lifecycle transitions and administrative assignment changes.
-- All commercial/customer/price snapshots remain append-only.
CREATE OR REPLACE FUNCTION protect_rental_order_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME <> 'RentalOrder' THEN
    RAISE EXCEPTION 'Confirmed rental order history is append-only';
  END IF;

  IF
    (to_jsonb(NEW) - ARRAY['reservationStatus', 'reservationVersion']) IS NOT DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['reservationStatus', 'reservationVersion'])
    AND NEW."reservationVersion" = OLD."reservationVersion" + 1
  THEN
    IF NOT (
      (OLD."reservationStatus" = 'NOT_RESERVED' AND NEW."reservationStatus" IN ('NOT_RESERVED', 'PARTIALLY_RESERVED', 'RESERVED', 'RESERVATION_FAILED')) OR
      (OLD."reservationStatus" = 'RESERVATION_FAILED' AND NEW."reservationStatus" IN ('NOT_RESERVED', 'PARTIALLY_RESERVED', 'RESERVED', 'RESERVATION_FAILED')) OR
      (OLD."reservationStatus" = 'PARTIALLY_RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED', 'RESERVED', 'RELEASED', 'PARTIALLY_CONSUMED', 'CONSUMED')) OR
      (OLD."reservationStatus" = 'RESERVED' AND NEW."reservationStatus" IN ('PARTIALLY_RESERVED', 'RESERVED', 'RELEASED', 'PARTIALLY_CONSUMED', 'CONSUMED')) OR
      (OLD."reservationStatus" = 'PARTIALLY_CONSUMED' AND NEW."reservationStatus" IN ('PARTIALLY_CONSUMED', 'CONSUMED')) OR
      (OLD."reservationStatus" = 'CONSUMED' AND NEW."reservationStatus" IN ('PARTIALLY_CONSUMED', 'CONSUMED')) OR
      (OLD."reservationStatus" = 'RELEASED' AND NEW."reservationStatus" = 'RELEASED')
    ) THEN
      RAISE EXCEPTION 'Invalid rental-order reservation status transition';
    END IF;
    RETURN NEW;
  END IF;

  IF
    (to_jsonb(NEW) - ARRAY['assignedToUserId', 'assignedAt', 'assignmentVersion']) IS NOT DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['assignedToUserId', 'assignedAt', 'assignmentVersion'])
    AND NEW."assignmentVersion" = OLD."assignmentVersion" + 1
    AND (
      (NEW."assignedToUserId" IS NULL AND NEW."assignedAt" IS NULL) OR
      (NEW."assignedToUserId" IS NOT NULL AND NEW."assignedAt" IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only a versioned rental-order reservation or assignment transition is allowed';
END;
$$ LANGUAGE plpgsql;
