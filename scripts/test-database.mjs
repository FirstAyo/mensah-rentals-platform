import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function parseEnvironmentFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

export function assertSafeTestDatabase(environment) {
  const development = environment.DATABASE_URL;
  const candidate = environment.TEST_DATABASE_URL;
  if (!development || !candidate)
    throw new Error(
      'DATABASE_URL and TEST_DATABASE_URL are required. Copy the current .env.example values into your ignored .env.',
    );
  let developmentUrl;
  let testUrl;
  try {
    developmentUrl = new URL(development);
    testUrl = new URL(candidate);
  } catch {
    throw new Error('Development and test database URLs must be valid URLs.');
  }
  if (!['postgres:', 'postgresql:'].includes(testUrl.protocol))
    throw new Error('TEST_DATABASE_URL must use PostgreSQL.');
  const databaseName = decodeURIComponent(testUrl.pathname.replace(/^\//, ''));
  if (!/^[a-z0-9_]+_test$/i.test(databaseName))
    throw new Error('The test database name must end with _test.');
  if (!['localhost', '127.0.0.1', '::1'].includes(testUrl.hostname))
    throw new Error(
      'The automatic test reset is restricted to local PostgreSQL.',
    );
  if (databaseIdentity(developmentUrl) === databaseIdentity(testUrl))
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  return {
    databaseName,
    testUrl: testUrl.toString(),
    username: testUrl.username,
  };
}

function databaseIdentity(url) {
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  const normalizedHost = ['localhost', '127.0.0.1', '::1'].includes(host)
    ? 'loopback'
    : host;
  const port = url.port || '5432';
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const schema = url.searchParams.get('schema') || 'public';
  return `${normalizedHost}:${port}/${database}?schema=${schema}`;
}

export function loadTestEnvironment(root = repositoryRoot) {
  let fileValues;
  try {
    fileValues = parseEnvironmentFile(
      readFileSync(resolve(root, '.env'), 'utf8'),
    );
  } catch {
    throw new Error(
      'The ignored root .env file is required for database tests.',
    );
  }
  const environment = { ...fileValues, ...process.env };
  const validationEnvironment =
    environment.MENSAH_TEST_DATABASE_GUARD === 'verified-local-test-database'
      ? { ...environment, DATABASE_URL: fileValues.DATABASE_URL }
      : environment;
  const safe = assertSafeTestDatabase(validationEnvironment);
  return {
    environment: {
      ...environment,
      DATABASE_URL: safe.testUrl,
      MENSAH_TEST_DATABASE_GUARD: 'verified-local-test-database',
      NODE_ENV: 'test',
    },
    safe,
  };
}
