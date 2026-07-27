-- A corrected draft remains immutable: creating its replacement supersedes it.
CREATE OR REPLACE FUNCTION enforce_quote_lifecycle_transition() RETURNS trigger AS $$
BEGIN
  IF OLD."state" = NEW."state" THEN RETURN NEW; END IF;
  IF (OLD."state"='DRAFT' AND NEW."state" IN ('SENT','SUPERSEDED')) OR
     (OLD."state"='SENT' AND NEW."state"='VIEWED') OR
     (OLD."state" IN ('SENT','VIEWED') AND NEW."state" IN ('ACCEPTED','REJECTED','EXPIRED','SUPERSEDED')) THEN
    IF NEW."lifecycleVersion" <> OLD."lifecycleVersion" + 1 THEN
      RAISE EXCEPTION 'Quote lifecycle version must increment';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid quote lifecycle transition';
END;
$$ LANGUAGE plpgsql;
