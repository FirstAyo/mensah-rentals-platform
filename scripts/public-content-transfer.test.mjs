import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDevelopmentExportEnvironment,
  assertExactContentModels,
  assertNoForbiddenKeys,
  assertStagingImportEnvironment,
  collectLocalMediaPaths,
  filterTransferContent,
  stripKeys,
  transferCounts,
} from './public-content-transfer.mjs';

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
