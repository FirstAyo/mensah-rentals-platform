import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  assertSafeArtifactName,
  compareMediaFiles,
  createRestoreDatabaseName,
  evaluateIntegrityResults,
  isPathInside,
  parseOperatorArguments,
  resolveDatabaseContext,
  runProcess,
  scanMedia,
  validateArchiveEntries,
  validateArchiveEntryTypes,
  valuesMatch,
  writeJsonAtomic,
} from './database-operator-tooling.mjs';

const developmentUrl =
  'postgresql://mensah_dev:secret@localhost:5432/mensah_rentals_dev';
const testUrl =
  'postgresql://mensah_test:secret@localhost:5434/mensah_rentals_test';

test('database contexts accept only explicit local development or guarded test databases', () => {
  const environment = {
    DATABASE_URL: developmentUrl,
    TEST_DATABASE_URL: testUrl,
  };
  assert.deepEqual(resolveDatabaseContext(environment, 'development'), {
    databaseName: 'mensah_rentals_dev',
    environment,
    service: 'postgres',
    sourceKind: 'development',
    username: 'mensah_dev',
  });
  assert.equal(
    resolveDatabaseContext(environment, 'test').databaseName,
    'mensah_rentals_test',
  );
  assert.throws(
    () =>
      resolveDatabaseContext(
        {
          ...environment,
          TEST_DATABASE_URL:
            'postgresql://mensah_test:secret@db.example.com:5432/mensah_rentals_test',
        },
        'test',
      ),
    /loopback/i,
  );
  assert.throws(
    () =>
      resolveDatabaseContext(
        { ...environment, TEST_DATABASE_URL: developmentUrl },
        'test',
      ),
    /end with _test|differ/i,
  );
  assert.throws(
    () =>
      resolveDatabaseContext(
        { ...environment, DATABASE_URL: testUrl },
        'development',
      ),
    /source=test/i,
  );
});

test('restore names remain isolated, guarded, and PostgreSQL-safe', () => {
  const name = createRestoreDatabaseName('mensah_rentals_test', 'abc-123');
  assert.equal(name, 'mensah_rentals_restore_abc123_test');
  assert.match(name, /^[a-zA-Z0-9_]+_test$/);
  assert.ok(name.length <= 63);
  assert.throws(
    () => createRestoreDatabaseName('mensah;drop database', 'safe'),
    /unsafe/i,
  );
});

test('operator options reject duplicates and positional arguments', () => {
  assert.deepEqual(
    parseOperatorArguments(['--source=test', '--output=backups']),
    {
      source: 'test',
      output: 'backups',
    },
  );
  assert.throws(
    () => parseOperatorArguments(['--source=test', '--source=development']),
    /duplicate/i,
  );
  assert.throws(() => parseOperatorArguments(['test']), /positional/i);
});

test('artifact and archive paths cannot escape owned roots', () => {
  assert.equal(
    assertSafeArtifactName('database.dump', 'dump'),
    'database.dump',
  );
  assert.throws(
    () => assertSafeArtifactName('../database.dump', 'dump'),
    /unsafe/i,
  );
  assert.throws(() => assertSafeArtifactName('nested/file', 'dump'), /unsafe/i);
  assert.doesNotThrow(() =>
    validateArchiveEntries(['./', './products/a.webp']),
  );
  assert.throws(() => validateArchiveEntries(['../secret']), /unsafe/i);
  assert.throws(() => validateArchiveEntries(['/etc/passwd']), /unsafe/i);
  assert.throws(() => validateArchiveEntries(['C:\\secret.txt']), /unsafe/i);
  assert.doesNotThrow(() =>
    validateArchiveEntryTypes([
      'drwxr-xr-x user/group 0 date media/',
      '-rw-r--r-- user/group 1 date media/a.webp',
    ]),
  );
  assert.throws(
    () =>
      validateArchiveEntryTypes([
        'lrwxr-xr-x user/group 0 date media/link -> ../../escape',
      ]),
    /link or unsupported special entry/,
  );
  assert.equal(isPathInside('C:\\safe', 'C:\\safe\\child'), true);
});

test('media scanning is deterministic and comparisons detect missing, extra, or changed bytes', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'mensah-media-test-'));
  try {
    mkdirSync(resolve(root, 'products'));
    writeFileSync(resolve(root, 'products', 'b.webp'), Buffer.from([3, 4]));
    writeFileSync(resolve(root, 'products', 'a.webp'), Buffer.from([1, 2]));
    const baseline = scanMedia(root);
    assert.deepEqual(
      baseline.map((entry) => entry.relativePath),
      ['products/a.webp', 'products/b.webp'],
    );
    assert.deepEqual(compareMediaFiles(baseline, scanMedia(root)), []);
    writeFileSync(resolve(root, 'products', 'a.webp'), Buffer.from([9, 9]));
    assert.match(compareMediaFiles(baseline, scanMedia(root))[0], /mismatch/i);
    writeFileSync(resolve(root, 'extra.webp'), Buffer.from([1]));
    assert.ok(
      compareMediaFiles(baseline, scanMedia(root)).some((failure) =>
        failure.includes('Unexpected'),
      ),
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('integrity results fail closed and canonical comparisons ignore object key order', () => {
  const clean = evaluateIntegrityResults([
    { check: 'first', failures: 0 },
    { check: 'second', failures: '0' },
  ]);
  assert.equal(clean.passed, true);
  const broken = evaluateIntegrityResults([
    { check: 'first', failures: 0 },
    { check: 'second', failures: 2 },
  ]);
  assert.equal(broken.passed, false);
  assert.equal(broken.failures[0].check, 'second');
  assert.equal(
    valuesMatch({ b: 2, a: { d: 4, c: 3 } }, { a: { c: 3, d: 4 }, b: 2 }),
    true,
  );
});

test('atomic JSON writes produce a complete parseable manifest', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'mensah-manifest-test-'));
  try {
    const manifestPath = resolve(root, 'nested', 'manifest.json');
    writeJsonAtomic(manifestPath, { status: 'PASSED', count: 4 });
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, 'utf8')), {
      status: 'PASSED',
      count: 4,
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('process output is streamed to disk without text-shell conversion', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'mensah-stream-test-'));
  try {
    const output = resolve(root, 'binary.dump');
    await runProcess(
      process.execPath,
      ['-e', 'process.stdout.write(Buffer.from([0,255,13,10,128,1]))'],
      { outputFile: output },
    );
    assert.deepEqual([...readFileSync(output)], [0, 255, 13, 10, 128, 1]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
