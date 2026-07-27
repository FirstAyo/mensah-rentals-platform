-- Preserve quote identity and lifecycle evidence at the database boundary.
CREATE FUNCTION protect_quote_identity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     OLD."rentalRequestId" IS DISTINCT FROM NEW."rentalRequestId" OR
     OLD."quoteNumber" IS DISTINCT FROM NEW."quoteNumber" OR
     OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId" OR
     OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Quote identity and history are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Quote_protect_identity"
BEFORE UPDATE OR DELETE ON "Quote"
FOR EACH ROW EXECUTE FUNCTION protect_quote_identity();

CREATE OR REPLACE FUNCTION enforce_quote_lifecycle_transition() RETURNS trigger AS $$
BEGIN
  IF OLD."quoteRevisionId" IS DISTINCT FROM NEW."quoteRevisionId" OR
     OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Quote lifecycle identity is immutable';
  END IF;

  IF OLD."state" = NEW."state" THEN
    IF OLD."lifecycleVersion" IS DISTINCT FROM NEW."lifecycleVersion" OR
       OLD."sentAt" IS DISTINCT FROM NEW."sentAt" OR
       OLD."sentByUserId" IS DISTINCT FROM NEW."sentByUserId" OR
       OLD."viewedAt" IS DISTINCT FROM NEW."viewedAt" OR
       OLD."terminalAt" IS DISTINCT FROM NEW."terminalAt" THEN
      RAISE EXCEPTION 'Quote lifecycle evidence is immutable without a state transition';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."lifecycleVersion" <> OLD."lifecycleVersion" + 1 THEN
    RAISE EXCEPTION 'Quote lifecycle version must increment';
  END IF;

  IF OLD."state"='DRAFT' AND NEW."state"='SENT' AND
     OLD."sentAt" IS NULL AND NEW."sentAt" IS NOT NULL AND
     OLD."sentByUserId" IS NULL AND NEW."sentByUserId" IS NOT NULL AND
     OLD."viewedAt" IS NOT DISTINCT FROM NEW."viewedAt" AND
     OLD."terminalAt" IS NOT DISTINCT FROM NEW."terminalAt" THEN
    RETURN NEW;
  END IF;

  IF OLD."state"='SENT' AND NEW."state"='VIEWED' AND
     OLD."viewedAt" IS NULL AND NEW."viewedAt" IS NOT NULL AND
     OLD."sentAt" IS NOT DISTINCT FROM NEW."sentAt" AND
     OLD."sentByUserId" IS NOT DISTINCT FROM NEW."sentByUserId" AND
     OLD."terminalAt" IS NOT DISTINCT FROM NEW."terminalAt" THEN
    RETURN NEW;
  END IF;

  IF ((OLD."state"='DRAFT' AND NEW."state"='SUPERSEDED') OR
      (OLD."state" IN ('SENT','VIEWED') AND NEW."state" IN ('ACCEPTED','REJECTED','EXPIRED','SUPERSEDED'))) AND
     OLD."terminalAt" IS NULL AND NEW."terminalAt" IS NOT NULL AND
     OLD."sentAt" IS NOT DISTINCT FROM NEW."sentAt" AND
     OLD."sentByUserId" IS NOT DISTINCT FROM NEW."sentByUserId" AND
     OLD."viewedAt" IS NOT DISTINCT FROM NEW."viewedAt" THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid quote lifecycle transition or evidence mutation';
END;
$$ LANGUAGE plpgsql;
