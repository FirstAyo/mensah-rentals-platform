import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseEnvironmentFile,
  validateDeploymentEnvironment,
} from './deployment-preflight.mjs';

const secret = (label) => `${label}-${'x'.repeat(40)}`;

function stagingEnvironment() {
  return {
    ADMIN_ORIGIN: 'https://admin-staging.mensahrentals.com',
    API_INTERNAL_URL: 'http://api:4000',
    AUTH_COOKIE_SECURE: 'true',
    CADDY_ADMIN_ALIAS: 'mensah-staging-admin',
    CADDY_API_ALIAS: 'mensah-staging-api',
    CADDY_WEB_ALIAS: 'mensah-staging-web',
    COMPOSE_PROJECT_NAME: 'mensah-rentals-staging',
    DATABASE_URL: `postgresql://mensah_staging:${secret('database')}@postgres:5432/mensah_rentals_staging?schema=public`,
    NODE_ENV: 'production',
    PLATFORM_ENVIRONMENT: 'STAGING',
    POSTGRES_PASSWORD: secret('database'),
    POSTGRES_USER: 'mensah_staging',
    PUBLIC_CART_COOKIE_NAME: '__Host-mensah_staging_cart',
    PUBLIC_CART_COOKIE_SECURE: 'true',
    PUBLIC_ORDER_ACCESS_SECRET: secret('order'),
    PUBLIC_ORDER_COOKIE_NAME: '__Host-mensah_staging_order',
    PUBLIC_ORDER_COOKIE_SECURE: 'true',
    PUBLIC_QUOTE_ACCESS_SECRET: secret('quote'),
    PUBLIC_QUOTE_COOKIE_NAME: '__Host-mensah_staging_quote',
    PUBLIC_QUOTE_COOKIE_SECURE: 'true',
    PUBLIC_REQUEST_COOKIE_NAME: '__Host-mensah_staging_request',
    PUBLIC_REQUEST_COOKIE_SECURE: 'true',
    PUBLIC_REQUEST_TRACKING_SECRET: secret('request'),
    SITE_INDEXING_ENABLED: 'false',
    SITE_URL: 'https://staging.mensahrentals.com',
    STAFF_SESSION_COOKIE_NAME: '__Host-mensah_staging_staff',
    WEB_ORIGIN: 'https://staging.mensahrentals.com',
  };
}

test('parses comments, blank lines, and values containing equals signs', () => {
  assert.deepEqual(parseEnvironmentFile('# comment\nA=value=part\n\nB=two\n'), {
    A: 'value=part',
    B: 'two',
  });
});

test('accepts the exact safe staging boundary', () => {
  assert.deepEqual(validateDeploymentEnvironment(stagingEnvironment()), {
    platform: 'STAGING',
    siteUrl: 'https://staging.mensahrentals.com',
  });
});

test('rejects staging indexing', () => {
  assert.throws(
    () =>
      validateDeploymentEnvironment({
        ...stagingEnvironment(),
        SITE_INDEXING_ENABLED: 'true',
      }),
    /SITE_INDEXING_ENABLED must be false/u,
  );
});

test('rejects unchanged placeholders without echoing them', () => {
  assert.throws(
    () =>
      validateDeploymentEnvironment({
        ...stagingEnvironment(),
        PUBLIC_ORDER_ACCESS_SECRET:
          'CHANGE_ME_RANDOM_ORDER_SECRET_AT_LEAST_32_CHARACTERS',
      }),
    /PUBLIC_ORDER_ACCESS_SECRET must be replaced/u,
  );
});

test('rejects a mismatched database password', () => {
  assert.throws(
    () =>
      validateDeploymentEnvironment({
        ...stagingEnvironment(),
        POSTGRES_PASSWORD: secret('different'),
      }),
    /DATABASE_URL password must match POSTGRES_PASSWORD/u,
  );
});
