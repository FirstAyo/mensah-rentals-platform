-- Use whole-record comparisons for portable, explicit evidence protection.
CREATE OR REPLACE FUNCTION protect_quote_identity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quote identity and history are immutable';
  END IF;
  IF (to_jsonb(OLD) - ARRAY['latestRevisionId','customerRevisionId','updatedAt']) <>
     (to_jsonb(NEW) - ARRAY['latestRevisionId','customerRevisionId','updatedAt']) THEN
    RAISE EXCEPTION 'Quote identity and history are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_quote_lifecycle_transition() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId','viewedAt','terminalAt']) <>
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId','viewedAt','terminalAt']) THEN
    RAISE EXCEPTION 'Quote lifecycle identity is immutable';
  END IF;

  IF OLD."state" = NEW."state" THEN
    IF to_jsonb(OLD) <> to_jsonb(NEW) THEN
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
     (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId']) =
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId']) THEN
    RETURN NEW;
  END IF;

  IF OLD."state"='SENT' AND NEW."state"='VIEWED' AND
     OLD."viewedAt" IS NULL AND NEW."viewedAt" IS NOT NULL AND
     (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','viewedAt']) =
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','viewedAt']) THEN
    RETURN NEW;
  END IF;

  IF ((OLD."state"='DRAFT' AND NEW."state"='SUPERSEDED') OR
      (OLD."state" IN ('SENT','VIEWED') AND NEW."state" IN ('ACCEPTED','REJECTED','EXPIRED','SUPERSEDED'))) AND
     OLD."terminalAt" IS NULL AND NEW."terminalAt" IS NOT NULL AND
     (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','terminalAt']) =
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','terminalAt']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid quote lifecycle transition or evidence mutation';
END;
$$ LANGUAGE plpgsql;
