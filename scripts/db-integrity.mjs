import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  evaluateIntegrityResults,
  loadOperatorEnvironment,
  parseOperatorArguments,
  resolveDatabaseContext,
  runDockerPsql,
  safeFailureMessage,
} from './database-operator-tooling.mjs';

export const INTEGRITY_SQL = String.raw`
WITH
bulk_delta AS (
  SELECT "inventoryId", "toState" AS state, "quantity"::bigint AS delta
  FROM "InventoryTransaction" WHERE "toState" IS NOT NULL
  UNION ALL
  SELECT "inventoryId", "fromState" AS state, -"quantity"::bigint AS delta
  FROM "InventoryTransaction" WHERE "fromState" IS NOT NULL
),
bulk_balances AS (
  SELECT "inventoryId", state, sum(delta) AS quantity
  FROM bulk_delta GROUP BY "inventoryId", state
),
serialized_delta AS (
  SELECT "inventoryItemId", "toState" AS state, quantity::bigint AS delta
  FROM "InventoryTransaction"
  WHERE "inventoryItemId" IS NOT NULL AND "toState" IS NOT NULL
  UNION ALL
  SELECT "inventoryItemId", "fromState" AS state, -quantity::bigint AS delta
  FROM "InventoryTransaction"
  WHERE "inventoryItemId" IS NOT NULL AND "fromState" IS NOT NULL
),
serialized_balances AS (
  SELECT "inventoryItemId", state, sum(delta) AS quantity
  FROM serialized_delta GROUP BY "inventoryItemId", state
),
checks AS (
  SELECT 'negative_bulk_balances' AS check_name, count(*)::bigint AS failures
  FROM bulk_balances b
  JOIN "Inventory" i ON i.id=b."inventoryId" AND i."trackingMode"='BULK'
  WHERE b.quantity < 0

  UNION ALL
  SELECT 'bulk_inventory_has_serialized_items', count(*)::bigint
  FROM "InventoryItem" item
  JOIN "Inventory" inventory ON inventory.id=item."inventoryId"
  WHERE inventory."trackingMode"='BULK'

  UNION ALL
  SELECT 'inventory_transaction_shape', count(*)::bigint
  FROM "InventoryTransaction" transaction
  JOIN "Inventory" inventory ON inventory.id=transaction."inventoryId"
  WHERE
    (inventory."trackingMode"='BULK' AND transaction."inventoryItemId" IS NOT NULL)
    OR
    (inventory."trackingMode"='SERIALIZED' AND (
      transaction."inventoryItemId" IS NULL OR transaction.quantity<>1 OR
      NOT EXISTS (
        SELECT 1 FROM "InventoryItem" item
        WHERE item.id=transaction."inventoryItemId"
          AND item."inventoryId"=transaction."inventoryId"
      )
    ))

  UNION ALL
  SELECT 'serialized_projection_matches_ledger', count(*)::bigint
  FROM "InventoryItem" item
  WHERE EXISTS (
      SELECT 1 FROM serialized_balances existing
      WHERE existing."inventoryItemId"=item.id
    )
    AND (coalesce((
      SELECT balance.quantity FROM serialized_balances balance
      WHERE balance."inventoryItemId"=item.id AND balance.state=item.status
    ),0)<>1
    OR EXISTS (
      SELECT 1 FROM serialized_balances balance
      WHERE balance."inventoryItemId"=item.id
        AND balance.state<>item.status
        AND balance.quantity<>0
    ))

  UNION ALL
  SELECT 'reservation_item_quantity_equation', count(*)::bigint
  FROM "InventoryReservationItem"
  WHERE "requestedQuantity"<>"reservedQuantity"+"consumedQuantity"+"shortfallQuantity"
    OR "reservedQuantity"<0 OR "consumedQuantity"<0 OR "shortfallQuantity"<0

  UNION ALL
  SELECT 'serialized_active_allocation_overlap', count(*)::bigint
  FROM "SerializedAssetAllocation" left_allocation
  JOIN "SerializedAssetAllocation" right_allocation
    ON left_allocation.id < right_allocation.id
   AND left_allocation."inventoryItemId"=right_allocation."inventoryItemId"
   AND left_allocation.status='ACTIVE'
   AND right_allocation.status='ACTIVE'
   AND tstzrange(left_allocation."rangeStartUtc",left_allocation."rangeEndExclusiveUtc",'[)')
       && tstzrange(right_allocation."rangeStartUtc",right_allocation."rangeEndExclusiveUtc",'[)')

  UNION ALL
  SELECT 'fulfilment_quantity_consistency', count(*)::bigint
  FROM "OrderFulfilmentItem" fulfilment_item
  JOIN "InventoryReservationItem" reservation_item
    ON reservation_item.id=fulfilment_item."reservationItemId"
  WHERE fulfilment_item."preparedQuantity">reservation_item."reservedQuantity"
     OR fulfilment_item."checkedOutQuantity">fulfilment_item."orderedQuantitySnapshot"
     OR fulfilment_item."checkedOutQuantity"<>reservation_item."consumedQuantity"

  UNION ALL
  SELECT 'active_rental_quantity_consistency', count(*)::bigint
  FROM "ActiveRentalItem" active_item
  JOIN "OrderFulfilmentItem" fulfilment_item
    ON fulfilment_item.id=active_item."orderFulfilmentItemId"
  WHERE active_item."checkedOutQuantity"<>fulfilment_item."checkedOutQuantity"
     OR active_item."checkedOutQuantity"<=0

  UNION ALL
  SELECT 'return_quantity_equations', count(*)::bigint
  FROM "RentalReturnItem"
  WHERE "receivedQuantity"<>"rentableQuantity"+"damagedQuantity"+"maintenanceQuantity"
     OR "expectedCheckedOutQuantity"<>"receivedQuantity"+"missingQuantity"+"outstandingQuantity"
     OR "receivedQuantity"<0 OR "missingQuantity"<0 OR "outstandingQuantity"<0

  UNION ALL
  SELECT 'serialized_checkout_return_duplicates', count(*)::bigint
  FROM (
    SELECT "inventoryItemId" FROM "ActiveRentalSerializedAsset"
    GROUP BY "activeRentalItemId", "inventoryItemId" HAVING count(*)>1
    UNION ALL
    SELECT "activeRentalSerializedAssetId" FROM "ReturnedSerializedAsset"
    GROUP BY "activeRentalSerializedAssetId" HAVING count(*)>1
  ) duplicates

  UNION ALL
  SELECT 'active_serialized_maintenance_duplicates', count(*)::bigint
  FROM (
    SELECT "inventoryItemId" FROM "MaintenanceWorkOrder"
    WHERE "inventoryItemId" IS NOT NULL
      AND status IN ('OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_PARTS','READY_FOR_INSPECTION')
    GROUP BY "inventoryItemId" HAVING count(*)>1
  ) duplicates

  UNION ALL
  SELECT 'maintenance_target_shape', count(*)::bigint
  FROM "MaintenanceWorkOrder" work_order
  JOIN "Inventory" inventory ON inventory.id=work_order."inventoryId"
  WHERE work_order.quantity<=0
     OR (inventory."trackingMode"='SERIALIZED' AND (work_order."inventoryItemId" IS NULL OR work_order.quantity<>1))
     OR (inventory."trackingMode"='BULK' AND work_order."inventoryItemId" IS NOT NULL)

  UNION ALL
  SELECT 'maintenance_terminal_consistency', count(*)::bigint
  FROM "MaintenanceWorkOrder"
  WHERE (status='COMPLETED' AND ("completedAt" IS NULL OR "completionOutcome" IS NULL))
     OR (status<>'COMPLETED' AND ("completedAt" IS NOT NULL OR "completionOutcome" IS NOT NULL))
     OR (status='CANCELLED' AND ("cancelledAt" IS NULL OR "cancellationReason" IS NULL))
     OR (status<>'CANCELLED' AND "cancelledAt" IS NOT NULL)

  UNION ALL
  SELECT 'inspection_terminal_consistency', count(*)::bigint
  FROM "EquipmentInspection"
  WHERE (status IN ('PASSED','FAILED') AND ("completedAt" IS NULL OR result::text<>status::text))
     OR (status NOT IN ('PASSED','FAILED') AND ("completedAt" IS NOT NULL OR result IS NOT NULL))
     OR (status='CANCELLED' AND "cancelledAt" IS NULL)
     OR (status<>'CANCELLED' AND "cancelledAt" IS NOT NULL)

  UNION ALL
  SELECT 'homepage_head_integrity', count(*)::bigint
  FROM "HomepageSite" site
  WHERE (site."draftRevisionId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "HomepageRevision" revision
      WHERE revision.id=site."draftRevisionId" AND revision."homepageId"=site.id AND revision.kind='DRAFT'
    ))
    OR (site."publishedRevisionId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "HomepageRevision" revision
      WHERE revision.id=site."publishedRevisionId" AND revision."homepageId"=site.id AND revision.kind='PUBLISHED'
    ))

  UNION ALL
  SELECT 'homepage_media_source_exclusivity',
    (SELECT count(*) FROM "HomepageMediaPlacement"
      WHERE ("mediaId" IS NOT NULL)=("productImageId" IS NOT NULL))
    +
    (SELECT count(*) FROM "CategoryCover"
      WHERE ("homepageMediaId" IS NOT NULL)=("productImageId" IS NOT NULL))

  UNION ALL
  SELECT 'unfinished_prisma_migrations', count(*)::bigint
  FROM "_prisma_migrations"
  WHERE finished_at IS NULL AND rolled_back_at IS NULL
)
SELECT coalesce(jsonb_agg(jsonb_build_object('check',check_name,'failures',failures) ORDER BY check_name),'[]'::jsonb)::text
FROM checks;
`;

export async function runIntegrityChecks(context, databaseName) {
  const raw = await runDockerPsql(context, INTEGRITY_SQL, databaseName);
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    throw new Error('PostgreSQL returned invalid integrity-check output.');
  }
  return evaluateIntegrityResults(rows);
}

async function main() {
  const options = parseOperatorArguments(process.argv.slice(2));
  for (const key of Object.keys(options)) {
    if (key !== 'source')
      throw new Error(`Unsupported integrity option: --${key}`);
  }
  const environment = loadOperatorEnvironment();
  const context = resolveDatabaseContext(
    environment,
    options.source || 'development',
  );
  const result = await runIntegrityChecks(context);
  for (const check of result.checks) {
    console.log(
      `${check.failures === 0 ? 'PASS' : 'FAIL'} ${check.check}: ${check.failures}`,
    );
  }
  if (!result.passed) {
    throw new Error(`${result.failures.length} integrity check(s) failed.`);
  }
  console.log(`Database integrity passed (${result.checks.length} checks).`);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(`Integrity check failed: ${safeFailureMessage(error)}`);
    process.exitCode = 1;
  });
}
