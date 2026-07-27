-- Prisma updates the lifecycle row's updatedAt timestamp on legal transitions.
CREATE OR REPLACE FUNCTION enforce_quote_lifecycle_transition() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId','viewedAt','terminalAt','updatedAt']) <>
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId','viewedAt','terminalAt','updatedAt']) THEN
    RAISE EXCEPTION 'Quote lifecycle identity is immutable';
  END IF;

  IF OLD."state" = NEW."state" THEN
    RAISE EXCEPTION 'Quote lifecycle evidence requires a state transition';
  END IF;

  IF NEW."lifecycleVersion" <> OLD."lifecycleVersion" + 1 THEN
    RAISE EXCEPTION 'Quote lifecycle version must increment';
  END IF;

  IF OLD."state"='DRAFT' AND NEW."state"='SENT' AND
     OLD."sentAt" IS NULL AND NEW."sentAt" IS NOT NULL AND
     OLD."sentByUserId" IS NULL AND NEW."sentByUserId" IS NOT NULL AND
     (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId','updatedAt']) =
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','sentAt','sentByUserId','updatedAt']) THEN
    RETURN NEW;
  END IF;

  IF OLD."state"='SENT' AND NEW."state"='VIEWED' AND
     OLD."viewedAt" IS NULL AND NEW."viewedAt" IS NOT NULL AND
     (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','viewedAt','updatedAt']) =
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','viewedAt','updatedAt']) THEN
    RETURN NEW;
  END IF;

  IF ((OLD."state"='DRAFT' AND NEW."state"='SUPERSEDED') OR
      (OLD."state" IN ('SENT','VIEWED') AND NEW."state" IN ('ACCEPTED','REJECTED','EXPIRED','SUPERSEDED'))) AND
     OLD."terminalAt" IS NULL AND NEW."terminalAt" IS NOT NULL AND
     (to_jsonb(OLD) - ARRAY['state','lifecycleVersion','terminalAt','updatedAt']) =
     (to_jsonb(NEW) - ARRAY['state','lifecycleVersion','terminalAt','updatedAt']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid quote lifecycle transition or evidence mutation';
END;
$$ LANGUAGE plpgsql;
