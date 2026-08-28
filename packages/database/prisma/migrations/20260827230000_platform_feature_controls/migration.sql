CREATE TYPE "PlatformFeatureKey" AS ENUM (
  'RENTAL_REQUESTS',
  'QUOTES_AND_ORDERS',
  'CUSTOMER_ORDER_PORTAL',
  'INVENTORY_TRACKING',
  'RESERVATIONS',
  'FULFILMENT',
  'RETURNS',
  'DAMAGED_RETURN_HANDLING',
  'MAINTENANCE',
  'INSPECTIONS',
  'OPERATIONAL_REPORTING'
);

CREATE TYPE "PlatformFeatureState" AS ENUM (
  'DISABLED',
  'INTERNAL_TESTING',
  'ENABLED'
);

CREATE TABLE "PlatformFeatureSetting" (
  "key" "PlatformFeatureKey" NOT NULL,
  "state" "PlatformFeatureState" NOT NULL DEFAULT 'ENABLED',
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformFeatureSetting_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "PlatformFeatureSetting_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PlatformFeatureSetting_state_key_idx"
  ON "PlatformFeatureSetting"("state", "key");
CREATE INDEX "PlatformFeatureSetting_updatedByUserId_updatedAt_idx"
  ON "PlatformFeatureSetting"("updatedByUserId", "updatedAt");

INSERT INTO "PlatformFeatureSetting" ("key", "state", "version") VALUES
  ('RENTAL_REQUESTS', 'ENABLED', 0),
  ('QUOTES_AND_ORDERS', 'ENABLED', 0),
  ('CUSTOMER_ORDER_PORTAL', 'ENABLED', 0),
  ('INVENTORY_TRACKING', 'ENABLED', 0),
  ('RESERVATIONS', 'ENABLED', 0),
  ('FULFILMENT', 'ENABLED', 0),
  ('RETURNS', 'ENABLED', 0),
  ('DAMAGED_RETURN_HANDLING', 'ENABLED', 0),
  ('MAINTENANCE', 'ENABLED', 0),
  ('INSPECTIONS', 'ENABLED', 0),
  ('OPERATIONAL_REPORTING', 'ENABLED', 0);
