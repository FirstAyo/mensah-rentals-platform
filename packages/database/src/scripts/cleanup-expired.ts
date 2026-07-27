import { cleanupExpiredData } from '../expired-cleanup';
import { prisma } from '../index';

function numericArgument(name: string): number | undefined {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!raw) return undefined;
  const parsed = Number(raw.slice(prefix.length));
  if (!Number.isInteger(parsed)) throw new Error(`Invalid --${name} value.`);
  return parsed;
}

async function main() {
  const unknown = process.argv
    .slice(2)
    .filter(
      (value) =>
        value !== '--dry-run' &&
        !value.startsWith('--batch-size=') &&
        !value.startsWith('--max-batches='),
    );
  if (unknown.length)
    throw new Error(`Unknown cleanup argument: ${unknown[0]}`);
  const result = await cleanupExpiredData(prisma, {
    batchSize: numericArgument('batch-size'),
    dryRun: process.argv.includes('--dry-run'),
    maxBatches: numericArgument('max-batches'),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.truncated)
    console.warn('Cleanup reached its configured bound; run it again safely.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Cleanup failed.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
