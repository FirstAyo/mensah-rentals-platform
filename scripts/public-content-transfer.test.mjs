import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertContentExportEnvironment,
  assertContentImportEnvironment,
  assertDevelopmentExportEnvironment,
  assertExactContentModels,
  assertNoForbiddenKeys,
  assertProductionBundleSource,
  assertStagingImportEnvironment,
  collectLocalMediaPaths,
  filterTransferContent,
  stripKeys,
  transferCounts,
} from './public-content-transfer.mjs';

test('deployment operator mounts media at the configured runtime path', () => {
  const compose = readFileSync(
    new URL('../compose.deploy.yml', import.meta.url),
    'utf8',
  );
  const environmentTemplate = readFileSync(
    new URL('../deploy/production.env.example', import.meta.url),
    'utf8',
  );

  assert.match(
    environmentTemplate,
    /^MEDIA_STORAGE_ROOT=\/app\/storage\/media$/m,
  );
  assert.match(
    compose,
    /migrate:[\s\S]*?volumes:\s*\n\s*- media_data:\/app\/storage\/media/,
  );
});

test('allows export only from a loopback non-test database', () => {
  assert.doesNotThrow(() =>
    assertDevelopmentExportEnvironment({
      DATABASE_URL: 'postgresql://user:secret@127.0.0.1:5432/mensah_dev',
    }),
  );
  assert.throws(() =>
    assertDevelopmentExportEnvironment({
      DATABASE_URL: 'postgresql://user:secret@example.com:5432/mensah',
    }),
  );
  assert.throws(() =>
    assertDevelopmentExportEnvironment({
      DATABASE_URL: 'postgresql://user:secret@localhost:5432/mensah_test',
    }),
  );
});

test('requires an explicit production-mode staging import confirmation', () => {
  assert.doesNotThrow(() =>
    assertStagingImportEnvironment({
      CONTENT_IMPORT_CONFIRM_ENVIRONMENT: 'STAGING',
      NODE_ENV: 'production',
      PLATFORM_ENVIRONMENT: 'STAGING',
    }),
  );
  assert.throws(() =>
    assertStagingImportEnvironment({
      CONTENT_IMPORT_CONFIRM_ENVIRONMENT: 'STAGING',
      NODE_ENV: 'production',
      PLATFORM_ENVIRONMENT: 'PRODUCTION',
    }),
  );
});

test('allows staging export only with confirmation and an exact source commit', () => {
  assert.equal(
    assertContentExportEnvironment({
      CONTENT_EXPORT_CONFIRM_ENVIRONMENT: 'STAGING',
      CONTENT_EXPORT_SOURCE_COMMIT_SHA:
        '5d490cda7cf401a4430987689c599063c1cb67d0',
      DATABASE_URL: 'postgresql://user:secret@postgres:5432/mensah_staging',
      NODE_ENV: 'production',
      PLATFORM_ENVIRONMENT: 'STAGING',
    }),
    'STAGING',
  );
  assert.throws(() =>
    assertContentExportEnvironment({
      CONTENT_EXPORT_CONFIRM_ENVIRONMENT: 'STAGING',
      DATABASE_URL: 'postgresql://user:secret@postgres:5432/mensah_staging',
      NODE_ENV: 'production',
      PLATFORM_ENVIRONMENT: 'STAGING',
    }),
  );
  assert.throws(() =>
    assertContentExportEnvironment({
      CONTENT_EXPORT_CONFIRM_ENVIRONMENT: 'PRODUCTION',
      CONTENT_EXPORT_SOURCE_COMMIT_SHA:
        '5d490cda7cf401a4430987689c599063c1cb67d0',
      DATABASE_URL: 'postgresql://user:secret@postgres:5432/mensah_production',
      NODE_ENV: 'production',
      PLATFORM_ENVIRONMENT: 'PRODUCTION',
    }),
  );
});

test('production import requires every destructive-boundary confirmation', () => {
  const environment = {
    CONTENT_IMPORT_CONFIRM_EMPTY_TARGET: 'YES',
    CONTENT_IMPORT_CONFIRM_ENVIRONMENT: 'PRODUCTION',
    CONTENT_IMPORT_CONFIRM_FEATURE_STATES: 'YES',
    CONTENT_IMPORT_CONFIRM_SCOPE: 'PUBLIC_CONTENT_ONLY',
    CONTENT_IMPORT_EXPECTED_SOURCE_COMMIT_SHA:
      '5d490cda7cf401a4430987689c599063c1cb67d0',
    NODE_ENV: 'production',
    PLATFORM_ENVIRONMENT: 'PRODUCTION',
  };
  assert.equal(assertContentImportEnvironment(environment), 'PRODUCTION');
  for (const key of [
    'CONTENT_IMPORT_CONFIRM_EMPTY_TARGET',
    'CONTENT_IMPORT_CONFIRM_ENVIRONMENT',
    'CONTENT_IMPORT_CONFIRM_FEATURE_STATES',
    'CONTENT_IMPORT_CONFIRM_SCOPE',
    'CONTENT_IMPORT_EXPECTED_SOURCE_COMMIT_SHA',
  ])
    assert.throws(() =>
      assertContentImportEnvironment({ ...environment, [key]: undefined }),
    );
});

test('production import accepts only the exact accepted staging bundle', () => {
  const environment = {
    CONTENT_IMPORT_EXPECTED_SOURCE_COMMIT_SHA:
      '5d490cda7cf401a4430987689c599063c1cb67d0',
  };
  assert.doesNotThrow(() =>
    assertProductionBundleSource(environment, {
      sourceCommitSha: '5d490cda7cf401a4430987689c599063c1cb67d0',
      sourceEnvironment: 'STAGING',
    }),
  );
  assert.throws(() =>
    assertProductionBundleSource(environment, {
      sourceCommitSha: '0ff3e0dd1bfc3a255e88f629dd15e19202e06a3a',
      sourceEnvironment: 'STAGING',
    }),
  );
  assert.throws(() =>
    assertProductionBundleSource(environment, {
      sourceCommitSha: '5d490cda7cf401a4430987689c599063c1cb67d0',
      sourceEnvironment: 'LOCAL',
    }),
  );
});

test('recursively rejects authentication and operational identity fields', () => {
  assert.doesNotThrow(() =>
    assertNoForbiddenKeys({ product: [{ id: 'safe', name: 'Chair' }] }),
  );
  for (const key of ['passwordHash', 'tokenHash', 'operationId', 'actorUserId'])
    assert.throws(() =>
      assertNoForbiddenKeys({ nested: [{ [key]: 'secret' }] }),
    );
});

test('preserves Date values while sanitizing exported records', () => {
  const createdAt = new Date('2026-09-03T05:27:17.000Z');
  const sanitized = stripKeys({ createdAt, name: 'Chair' });

  assert.equal(sanitized.createdAt, createdAt);
  assert.equal(
    JSON.stringify(sanitized),
    '{"createdAt":"2026-09-03T05:27:17.000Z","name":"Chair"}',
  );
});

test('excludes deleted catalogue fixtures and their dependent records', () => {
  const filtered = filterTransferContent({
    category: [
      { deletedAt: null, id: 'category-live' },
      { deletedAt: new Date(), id: 'category-deleted' },
    ],
    product: [
      { categoryId: 'category-live', deletedAt: null, id: 'product-live' },
      {
        categoryId: 'category-deleted',
        deletedAt: new Date(),
        id: 'product-deleted',
      },
    ],
    productImage: [
      { id: 'image-live', productId: 'product-live' },
      { id: 'image-deleted', productId: 'product-deleted' },
    ],
    productSpecification: [
      { id: 'spec-live', productId: 'product-live' },
      { id: 'spec-deleted', productId: 'product-deleted' },
    ],
  });

  assert.deepEqual(
    filtered.category.map((row) => row.id),
    ['category-live'],
  );
  assert.deepEqual(
    filtered.product.map((row) => row.id),
    ['product-live'],
  );
  assert.deepEqual(
    filtered.productImage.map((row) => row.id),
    ['image-live'],
  );
  assert.deepEqual(
    filtered.productSpecification.map((row) => row.id),
    ['spec-live'],
  );
});

test('collects only unique local media referenced by exported records', () => {
  assert.deepEqual(
    collectLocalMediaPaths({
      homepageMedia: [
        { url: '/media/homepage/one/image.webp' },
        { url: 'https://cdn.example.com/image.webp' },
      ],
      productImage: [
        { url: '/media/products/one/image.webp' },
        { url: '/media/products/one/image.webp' },
      ],
    }),
    ['homepage/one/image.webp', 'products/one/image.webp'],
  );
});

test('reports an exact allowlisted model count set', () => {
  const counts = transferCounts({ category: [{ id: 'one' }], product: [] });
  assert.equal(counts.category, 1);
  assert.equal(counts.product, 0);
  assert.equal(Object.hasOwn(counts, 'user'), false);
});

test('rejects bundles containing extra or missing model collections', () => {
  const complete = Object.fromEntries(
    Object.keys(transferCounts({})).map((model) => [model, []]),
  );
  assert.doesNotThrow(() => assertExactContentModels(complete));
  assert.throws(() => assertExactContentModels({ ...complete, user: [] }));
  const missing = { ...complete };
  delete missing.category;
  assert.throws(() => assertExactContentModels(missing));
});
