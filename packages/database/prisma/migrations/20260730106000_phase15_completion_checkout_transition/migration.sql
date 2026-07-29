-- A commercially partial checkout may consume every currently reserved unit.
-- If staff later reserve the remaining order quantity, the projection reopens
-- from CONSUMED to PARTIALLY_CONSUMED without changing immutable history.
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
    (OLD."reservationStatus"='CONSUMED' AND NEW."reservationStatus" IN ('PARTIALLY_CONSUMED','CONSUMED')) OR
    (OLD."reservationStatus"='RELEASED' AND NEW."reservationStatus"='RELEASED')
  ) THEN RAISE EXCEPTION 'Invalid rental-order reservation status transition'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
