import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSafeTestDatabase } from './test-database.mjs';

const development =
  'postgresql://mensah_dev:password@localhost:5432/mensah_rentals_dev';

test('accepts a distinct local database ending in _test', () => {
  const result = assertSafeTestDatabase({
    DATABASE_URL: development,
    TEST_DATABASE_URL:
      'postgresql://mensah_test:password@localhost:5434/mensah_rentals_test',
  });
  assert.equal(result.databaseName, 'mensah_rentals_test');
});

test('rejects the development database, unsafe names, and remote hosts', () => {
  assert.throws(() =>
    assertSafeTestDatabase({
      DATABASE_URL: development,
      TEST_DATABASE_URL: development,
    }),
  );
  assert.throws(() =>
    assertSafeTestDatabase({
      DATABASE_URL: development,
      TEST_DATABASE_URL:
        'postgresql://mensah_test:password@localhost:5434/mensah_rentals_dev',
    }),
  );
  assert.throws(() =>
    assertSafeTestDatabase({
      DATABASE_URL: development,
      TEST_DATABASE_URL:
        'postgresql://mensah_test:password@db.example.com:5432/mensah_rentals_test',
    }),
  );
  assert.throws(() =>
    assertSafeTestDatabase({
      DATABASE_URL:
        'postgresql://developer:first@127.0.0.1:5432/mensah_rentals_test?schema=public&connection_limit=5',
      TEST_DATABASE_URL:
        'postgresql://tester:second@localhost/mensah_rentals_test?schema=public',
    }),
  );
});
