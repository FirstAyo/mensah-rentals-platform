export interface SystemStatusResponse {
  generatedAt: string;
  environment: string;
  api: {
    status: string;
    uptimeSeconds: number;
    version: string | null;
    commit: string | null;
  };
  database: {
    status: string;
    migrations: {
      applied: number | null;
      expected: number | null;
      failed: number | null;
      upToDate: boolean | null;
    };
  };
  media: { status: string };
  integrations: { googleReviews: { configured: boolean } };
}

export interface BackupStatusResponse {
  generatedAt: string;
  configured: boolean;
  lastBackupAt: string | null;
  lastVerificationAt: string | null;
  lastVerificationResult: 'PASSED' | 'FAILED' | 'UNKNOWN';
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function only(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseSystemStatus(value: unknown): SystemStatusResponse | null {
  const root = object(value);
  const api = object(root?.api);
  const database = object(root?.database);
  const migrations = object(database?.migrations);
  const media = object(root?.media);
  const integrations = object(root?.integrations);
  const google = object(integrations?.googleReviews);
  if (
    !root ||
    !only(root, [
      'generatedAt',
      'environment',
      'api',
      'database',
      'media',
      'integrations',
    ]) ||
    typeof root.generatedAt !== 'string' ||
    typeof root.environment !== 'string' ||
    !api ||
    !only(api, ['status', 'uptimeSeconds', 'version', 'commit']) ||
    typeof api.status !== 'string' ||
    typeof api.uptimeSeconds !== 'number' ||
    (api.version !== null && typeof api.version !== 'string') ||
    (api.commit !== null && typeof api.commit !== 'string') ||
    !database ||
    !only(database, ['status', 'migrations']) ||
    typeof database.status !== 'string' ||
    !migrations ||
    !only(migrations, ['applied', 'expected', 'failed', 'upToDate']) ||
    (migrations.applied !== null && !Number.isInteger(migrations.applied)) ||
    (migrations.expected !== null && !Number.isInteger(migrations.expected)) ||
    (migrations.failed !== null && !Number.isInteger(migrations.failed)) ||
    (migrations.upToDate !== null &&
      typeof migrations.upToDate !== 'boolean') ||
    !media ||
    !only(media, ['status']) ||
    typeof media.status !== 'string' ||
    !integrations ||
    !only(integrations, ['googleReviews']) ||
    !google ||
    !only(google, ['configured']) ||
    typeof google.configured !== 'boolean'
  )
    return null;
  return root as unknown as SystemStatusResponse;
}

export function parseBackupStatus(value: unknown): BackupStatusResponse | null {
  const root = object(value);
  if (
    !root ||
    !only(root, [
      'generatedAt',
      'configured',
      'lastBackupAt',
      'lastVerificationAt',
      'lastVerificationResult',
    ]) ||
    typeof root.generatedAt !== 'string' ||
    typeof root.configured !== 'boolean' ||
    !['lastBackupAt', 'lastVerificationAt'].every(
      (key) => root[key] === null || typeof root[key] === 'string',
    ) ||
    !['PASSED', 'FAILED', 'UNKNOWN'].includes(
      String(root.lastVerificationResult),
    )
  )
    return null;
  return root as unknown as BackupStatusResponse;
}
