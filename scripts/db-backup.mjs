import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createOwnedTemporaryDirectory,
  formatTimestamp,
  isPathInside,
  loadOperatorEnvironment,
  parseOperatorArguments,
  readApplicationCommit,
  repositoryRoot,
  resolveDatabaseContext,
  runDockerPsql,
  runProcess,
  safeFailureMessage,
  scanMedia,
  sha256FileStream,
  valuesMatch,
  writeJsonAtomic,
} from './database-operator-tooling.mjs';

const SUMMARY_SQL = String.raw`
WITH
counts AS (
  SELECT jsonb_build_object(
    'Category', (SELECT count(*) FROM "Category"),
    'Product', (SELECT count(*) FROM "Product"),
    'ProductImage', (SELECT count(*) FROM "ProductImage"),
    'Inventory', (SELECT count(*) FROM "Inventory"),
    'InventoryItem', (SELECT count(*) FROM "InventoryItem"),
    'RentalRequest', (SELECT count(*) FROM "RentalRequest"),
    'Quote', (SELECT count(*) FROM "Quote"),
    'RentalOrder', (SELECT count(*) FROM "RentalOrder"),
    'InventoryReservation', (SELECT count(*) FROM "InventoryReservation"),
    'OrderFulfilment', (SELECT count(*) FROM "OrderFulfilment"),
    'ActiveRental', (SELECT count(*) FROM "ActiveRental"),
    'RentalReturn', (SELECT count(*) FROM "RentalReturn"),
    'RentalIssue', (SELECT count(*) FROM "RentalIssue"),
    'MaintenanceWorkOrder', (SELECT count(*) FROM "MaintenanceWorkOrder"),
    'EquipmentInspection', (SELECT count(*) FROM "EquipmentInspection"),
    'HomepageRevision', (SELECT count(*) FROM "HomepageRevision"),
    'HomepageMedia', (SELECT count(*) FROM "HomepageMedia")
  ) AS value
),
bulk_delta AS (
  SELECT transaction."inventoryId", transaction."toState" AS state, transaction."quantity"::bigint AS delta
  FROM "InventoryTransaction" transaction
  JOIN "Inventory" inventory ON inventory.id=transaction."inventoryId"
  WHERE transaction."toState" IS NOT NULL AND inventory."trackingMode"='BULK'
  UNION ALL
  SELECT transaction."inventoryId", transaction."fromState" AS state, -transaction."quantity"::bigint AS delta
  FROM "InventoryTransaction" transaction
  JOIN "Inventory" inventory ON inventory.id=transaction."inventoryId"
  WHERE transaction."fromState" IS NOT NULL AND inventory."trackingMode"='BULK'
),
state_totals AS (
  SELECT 'BULK_'||state::text AS state, sum(delta)::bigint AS quantity FROM bulk_delta GROUP BY state
  UNION ALL
  SELECT 'SERIALIZED_'||status::text, count(*)::bigint FROM "InventoryItem" GROUP BY status
),
states AS (
  SELECT coalesce(jsonb_object_agg(state, quantity), '{}'::jsonb) AS value
  FROM (SELECT state, sum(quantity)::bigint AS quantity FROM state_totals GROUP BY state) grouped
),
representatives AS (
  SELECT jsonb_build_object(
    'rentalRequestId', (SELECT id FROM "RentalRequest" ORDER BY id LIMIT 1),
    'quoteId', (SELECT id FROM "Quote" ORDER BY id LIMIT 1),
    'rentalOrderId', (SELECT id FROM "RentalOrder" ORDER BY id LIMIT 1),
    'inventoryTransactionId', (SELECT id FROM "InventoryTransaction" ORDER BY id LIMIT 1),
    'maintenanceWorkOrderId', (SELECT id FROM "MaintenanceWorkOrder" ORDER BY id LIMIT 1),
    'homepageRevisionId', (SELECT id FROM "HomepageRevision" ORDER BY id LIMIT 1)
  ) AS value
),
schema_summary AS (
  SELECT jsonb_build_object(
    'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
    'foreignKeys', (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f'),
    'checkConstraints', (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='c'),
    'indexes', (SELECT count(*) FROM pg_indexes WHERE schemaname='public'),
    'triggers', (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema='public')
  ) AS value
)
SELECT jsonb_build_object(
  'migrationCount', (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
  'failedMigrationCount', (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL),
  'tableCounts', counts.value,
  'inventoryStateTotals', states.value,
  'inventoryPhysicalTotal', coalesce((SELECT sum(value::bigint) FROM jsonb_each_text(states.value)), 0),
  'representatives', representatives.value,
  'schema', schema_summary.value
)::text
FROM counts, states, representatives, schema_summary;
`;

export async function readDatabaseSummary(context, databaseName) {
  const raw = await runDockerPsql(context, SUMMARY_SQL, databaseName);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('PostgreSQL returned an invalid backup summary.');
  }
}

function resolveBackupRoot(environment, explicitRoot) {
  const configured =
    explicitRoot || environment.BACKUP_DIRECTORY || '.local-backups';
  return resolve(repositoryRoot, configured);
}

function resolveMediaRoot(environment, sourceKind) {
  const configured =
    sourceKind === 'test'
      ? environment.TEST_MEDIA_STORAGE_ROOT || 'storage/test-media'
      : environment.MEDIA_STORAGE_ROOT || 'storage/media';
  return resolve(repositoryRoot, configured);
}

async function dumpDatabase(context, dumpPath) {
  await runProcess(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      context.service,
      'pg_dump',
      '--username',
      context.username,
      '--dbname',
      context.databaseName,
      '--format=custom',
      '--compress=6',
      '--no-owner',
      '--no-privileges',
    ],
    {
      environment: context.environment,
      outputFile: dumpPath,
    },
  );
}

async function createMediaArchive(mediaRoot, archivePath) {
  let archiveSource = mediaRoot;
  let temporaryEmptyRoot;
  if (!existsSync(mediaRoot)) {
    temporaryEmptyRoot = createOwnedTemporaryDirectory('mensah-empty-media-');
    archiveSource = temporaryEmptyRoot;
  }
  try {
    await runProcess('tar', ['-czf', archivePath, '-C', archiveSource, '.'], {
      environment: process.env,
    });
  } finally {
    if (temporaryEmptyRoot) {
      rmSync(temporaryEmptyRoot, { force: true, recursive: true });
    }
  }
}

export async function createBackup({
  backupRoot,
  environment = loadOperatorEnvironment(),
  now = new Date(),
  sourceKind = 'development',
} = {}) {
  const context = resolveDatabaseContext(environment, sourceKind);
  const selectedBackupRoot = resolveBackupRoot(environment, backupRoot);
  const mediaRoot = resolveMediaRoot(environment, sourceKind);
  if (isPathInside(mediaRoot, selectedBackupRoot)) {
    throw new Error(
      'The backup directory cannot be inside MEDIA_STORAGE_ROOT.',
    );
  }
  mkdirSync(selectedBackupRoot, { recursive: true });

  const setName = `${formatTimestamp(now)}-${sourceKind}`;
  const setDirectory = resolve(selectedBackupRoot, setName);
  if (!isPathInside(selectedBackupRoot, setDirectory)) {
    throw new Error('The backup set path escaped the configured backup root.');
  }
  mkdirSync(setDirectory, { recursive: false });

  const dumpFilename = 'database.dump';
  const mediaFilename = 'media.tar.gz';
  const manifestFilename = 'manifest.json';
  const dumpPath = resolve(setDirectory, dumpFilename);
  const mediaPath = resolve(setDirectory, mediaFilename);
  const manifestPath = resolve(setDirectory, manifestFilename);

  try {
    const summary = await readDatabaseSummary(context);
    if (Number(summary.failedMigrationCount) !== 0) {
      throw new Error('The source database contains an unfinished migration.');
    }
    const mediaBefore = scanMedia(mediaRoot);
    await dumpDatabase(context, dumpPath);
    await createMediaArchive(mediaRoot, mediaPath);
    const mediaAfter = scanMedia(mediaRoot);
    if (!valuesMatch(mediaBefore, mediaAfter)) {
      throw new Error('Media changed while the backup was being created.');
    }

    const manifest = {
      applicationCommit: await readApplicationCommit(environment),
      createdAt: now.toISOString(),
      database: {
        dumpFilename,
        sha256: await sha256FileStream(dumpPath),
        summary,
      },
      formatVersion: 1,
      media: {
        archiveFilename: mediaFilename,
        fileCount: mediaBefore.length,
        files: mediaBefore,
        sha256: await sha256FileStream(mediaPath),
      },
      sourceKind,
      verification: {
        status: 'NOT_VERIFIED',
      },
    };
    writeJsonAtomic(manifestPath, manifest);
    return { context, manifest, manifestPath, setDirectory, setName };
  } catch (error) {
    rmSync(setDirectory, { force: true, recursive: true });
    throw error;
  }
}

async function main() {
  const options = parseOperatorArguments(process.argv.slice(2));
  for (const key of Object.keys(options)) {
    if (!['source', 'output'].includes(key)) {
      throw new Error(`Unsupported backup option: --${key}`);
    }
  }
  const sourceKind = options.source || 'development';
  const result = await createBackup({
    backupRoot: options.output,
    sourceKind,
  });
  // The path is intentionally local operator output; no credentials are printed.
  console.log(`Backup created: ${result.setDirectory}`);
  console.log(
    `Database rows summarized; ${result.manifest.media.fileCount} media file(s) hashed.`,
  );
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(`Backup failed: ${safeFailureMessage(error)}`);
    process.exitCode = 1;
  });
}
