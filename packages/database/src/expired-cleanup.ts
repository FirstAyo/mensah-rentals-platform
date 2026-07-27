import type { Prisma, PrismaClient } from '@prisma/client';

export interface ExpiredCleanupOptions {
  batchSize?: number;
  cutoff?: Date;
  dryRun?: boolean;
  maxBatches?: number;
}

export interface ExpiredCleanupResult {
  carts: number;
  cutoff: string;
  dryRun: boolean;
  guestRequestSessions: number;
  staffSessions: number;
  truncated: boolean;
}

type CleanupTarget = 'carts' | 'guestRequestSessions' | 'staffSessions';
type Row = { id: string };

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 20;

export async function cleanupExpiredData(
  client: PrismaClient,
  options: ExpiredCleanupOptions = {},
): Promise<ExpiredCleanupResult> {
  const batchSize = boundedInteger(
    options.batchSize ?? DEFAULT_BATCH_SIZE,
    1,
    1000,
    'batch size',
  );
  const maxBatches = boundedInteger(
    options.maxBatches ?? DEFAULT_MAX_BATCHES,
    1,
    100,
    'maximum batches',
  );
  const cutoff = options.cutoff ?? new Date();
  if (Number.isNaN(cutoff.getTime()))
    throw new Error('Invalid cleanup cutoff.');
  const dryRun = options.dryRun ?? false;
  const result: ExpiredCleanupResult = {
    carts: 0,
    cutoff: cutoff.toISOString(),
    dryRun,
    guestRequestSessions: 0,
    staffSessions: 0,
    truncated: false,
  };

  for (const target of [
    'staffSessions',
    'carts',
    'guestRequestSessions',
  ] satisfies CleanupTarget[]) {
    const outcome = dryRun
      ? await preview(client, target, cutoff, batchSize * maxBatches)
      : await remove(client, target, cutoff, batchSize, maxBatches);
    result[target] = outcome.count;
    result.truncated ||= outcome.truncated;
  }
  return result;
}

async function preview(
  client: PrismaClient,
  target: CleanupTarget,
  cutoff: Date,
  maximum: number,
): Promise<{ count: number; truncated: boolean }> {
  const limit = maximum + 1;
  let rows: Row[];
  if (target === 'staffSessions')
    rows = await client.$queryRaw<Row[]>`
      SELECT "id" FROM "StaffSession"
      WHERE "expiresAt" <= ${cutoff}
      ORDER BY "expiresAt", "id" LIMIT ${limit}
    `;
  else if (target === 'carts')
    rows = await client.$queryRaw<Row[]>`
      SELECT "id" FROM "Cart"
      WHERE "expiresAt" <= ${cutoff}
      ORDER BY "expiresAt", "id" LIMIT ${limit}
    `;
  else
    rows = await client.$queryRaw<Row[]>`
      SELECT "id" FROM "GuestRequestSession"
      WHERE "expiresAt" <= ${cutoff}
      ORDER BY "expiresAt", "id" LIMIT ${limit}
    `;
  return {
    count: Math.min(rows.length, maximum),
    truncated: rows.length > maximum,
  };
}

async function remove(
  client: PrismaClient,
  target: CleanupTarget,
  cutoff: Date,
  batchSize: number,
  maxBatches: number,
): Promise<{ count: number; truncated: boolean }> {
  let count = 0;
  let finalBatchSize = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const removed = await client.$transaction((tx) =>
      removeBatch(tx, target, cutoff, batchSize),
    );
    finalBatchSize = removed;
    count += removed;
    if (removed < batchSize) return { count, truncated: false };
  }
  return { count, truncated: finalBatchSize === batchSize };
}

async function removeBatch(
  client: Prisma.TransactionClient,
  target: CleanupTarget,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  let rows: Row[];
  if (target === 'staffSessions')
    rows = await client.$queryRaw<Row[]>`
      WITH candidates AS (
        SELECT "id" FROM "StaffSession"
        WHERE "expiresAt" <= ${cutoff}
        ORDER BY "expiresAt", "id"
        FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
      )
      DELETE FROM "StaffSession" target USING candidates
      WHERE target."id" = candidates."id" AND target."expiresAt" <= ${cutoff}
      RETURNING target."id"
    `;
  else if (target === 'carts')
    rows = await client.$queryRaw<Row[]>`
      WITH candidates AS (
        SELECT "id" FROM "Cart"
        WHERE "expiresAt" <= ${cutoff}
        ORDER BY "expiresAt", "id"
        FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
      )
      DELETE FROM "Cart" target USING candidates
      WHERE target."id" = candidates."id" AND target."expiresAt" <= ${cutoff}
      RETURNING target."id"
    `;
  else
    rows = await client.$queryRaw<Row[]>`
      WITH candidates AS (
        SELECT "id" FROM "GuestRequestSession"
        WHERE "expiresAt" <= ${cutoff}
        ORDER BY "expiresAt", "id"
        FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
      )
      DELETE FROM "GuestRequestSession" target USING candidates
      WHERE target."id" = candidates."id" AND target."expiresAt" <= ${cutoff}
      RETURNING target."id"
    `;
  return rows.length;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(
      `Cleanup ${label} must be an integer from ${minimum} through ${maximum}.`,
    );
  return value;
}
