-- Phase 14 protected reservation identity while allowing allocation totals to
-- change. Consumption is another allocation-total transition, not an identity
-- mutation, so permit it alongside reserved/shortfall summaries.
CREATE OR REPLACE FUNCTION protect_inventory_reservation_item() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory reservation items cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['reservedQuantity','consumedQuantity','shortfallQuantity','updatedAt']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['reservedQuantity','consumedQuantity','shortfallQuantity','updatedAt']) THEN
    RAISE EXCEPTION 'Inventory reservation item identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
