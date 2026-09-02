import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER_PATTERN = /CHANGE_ME|example|development-only/i;
const REQUIRED_SECRET_KEYS = [
  'POSTGRES_PASSWORD',
  'PUBLIC_REQUEST_TRACKING_SECRET',
  'PUBLIC_QUOTE_ACCESS_SECRET',
  'PUBLIC_ORDER_ACCESS_SECRET',
];

export function parseEnvironmentFile(source) {
  const values = {};
  for (const [index, originalLine] of source.split(/\r?\n/u).entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1)
      throw new Error(`Invalid environment entry on line ${index + 1}.`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key))
      throw new Error(`Invalid environment key on line ${index + 1}.`);
    values[key] = value;
  }
  return values;
}

function requireValue(values, key) {
  const value = values[key];
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function requireExact(values, key, expected) {
  const actual = requireValue(values, key);
  if (actual !== expected)
    throw new Error(`${key} must be ${expected} for this environment.`);
}

export function validateDeploymentEnvironment(values) {
  requireExact(values, 'NODE_ENV', 'production');
  const platform = requireValue(values, 'PLATFORM_ENVIRONMENT');
  if (platform !== 'STAGING' && platform !== 'PRODUCTION')
    throw new Error('PLATFORM_ENVIRONMENT must be STAGING or PRODUCTION.');

  const staging = platform === 'STAGING';
  const expected = staging
    ? {
        ADMIN_ORIGIN: 'https://admin-staging.mensahrentals.com',
        COMPOSE_PROJECT_NAME: 'mensah-rentals-staging',
        SITE_INDEXING_ENABLED: 'false',
        SITE_URL: 'https://staging.mensahrentals.com',
        WEB_ORIGIN: 'https://staging.mensahrentals.com',
      }
    : {
        ADMIN_ORIGIN: 'https://admin.mensahrentals.com',
        COMPOSE_PROJECT_NAME: 'mensah-rentals-production',
        SITE_INDEXING_ENABLED: 'true',
        SITE_URL: 'https://mensahrentals.com',
        WEB_ORIGIN: 'https://mensahrentals.com',
      };
  for (const [key, value] of Object.entries(expected))
    requireExact(values, key, value);

  requireExact(values, 'API_INTERNAL_URL', 'http://api:4000');
  requireExact(values, 'AUTH_COOKIE_SECURE', 'true');
  requireExact(values, 'PUBLIC_CART_COOKIE_SECURE', 'true');
  requireExact(values, 'PUBLIC_REQUEST_COOKIE_SECURE', 'true');
  requireExact(values, 'PUBLIC_QUOTE_COOKIE_SECURE', 'true');
  requireExact(values, 'PUBLIC_ORDER_COOKIE_SECURE', 'true');

  for (const key of [
    'PUBLIC_CART_COOKIE_NAME',
    'PUBLIC_REQUEST_COOKIE_NAME',
    'PUBLIC_QUOTE_COOKIE_NAME',
    'PUBLIC_ORDER_COOKIE_NAME',
    'STAFF_SESSION_COOKIE_NAME',
  ]) {
    if (!requireValue(values, key).startsWith('__Host-'))
      throw new Error(`${key} must use the __Host- prefix.`);
  }

  for (const key of REQUIRED_SECRET_KEYS) {
    const value = requireValue(values, key);
    if (value.length < 32 || PLACEHOLDER_PATTERN.test(value))
      throw new Error(`${key} must be replaced with a strong unique value.`);
  }
  const secrets = REQUIRED_SECRET_KEYS.map((key) => values[key]);
  if (new Set(secrets).size !== secrets.length)
    throw new Error('Deployment secrets must be unique.');

  const databaseUrl = new URL(requireValue(values, 'DATABASE_URL'));
  if (
    databaseUrl.protocol !== 'postgresql:' ||
    databaseUrl.hostname !== 'postgres' ||
    databaseUrl.port !== '5432'
  )
    throw new Error('DATABASE_URL must target postgres:5432 inside Docker.');
  if (
    decodeURIComponent(databaseUrl.username) !==
    requireValue(values, 'POSTGRES_USER')
  )
    throw new Error('DATABASE_URL username must match POSTGRES_USER.');
  if (decodeURIComponent(databaseUrl.password) !== values.POSTGRES_PASSWORD)
    throw new Error('DATABASE_URL password must match POSTGRES_PASSWORD.');

  const aliases = [
    requireValue(values, 'CADDY_WEB_ALIAS'),
    requireValue(values, 'CADDY_ADMIN_ALIAS'),
    requireValue(values, 'CADDY_API_ALIAS'),
  ];
  if (new Set(aliases).size !== aliases.length)
    throw new Error('Caddy service aliases must be unique.');
  const aliasPrefix = staging ? 'mensah-staging-' : 'mensah-production-';
  if (aliases.some((alias) => !alias.startsWith(aliasPrefix)))
    throw new Error(`Caddy aliases must start with ${aliasPrefix}.`);

  return { platform, siteUrl: values.SITE_URL };
}

async function main() {
  const fileArgument = process.argv[2];
  const values = fileArgument
    ? parseEnvironmentFile(await readFile(resolve(fileArgument), 'utf8'))
    : process.env;
  const result = validateDeploymentEnvironment(values);
  process.stdout.write(
    `Deployment preflight passed for ${result.platform} (${result.siteUrl}). No secret values were printed.\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Deployment preflight failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
