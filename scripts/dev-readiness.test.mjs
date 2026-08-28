import assert from 'node:assert/strict';
import test from 'node:test';

import { waitForHttpReady } from './dev-readiness.mjs';

test('waitForHttpReady waits until the API reports success', async () => {
  let attempts = 0;
  await waitForHttpReady({
    fetcher: async () => {
      attempts += 1;
      return new Response(null, { status: attempts === 3 ? 200 : 503 });
    },
    intervalMs: 1,
    // Creating the first undici Response can take more than 100 ms on a cold or
    // busy Windows runner. Keep this comfortably below the real readiness
    // timeout while testing retry behaviour rather than host startup speed.
    timeoutMs: 1_000,
    url: 'http://127.0.0.1:4000/health',
  });
  assert.equal(attempts, 3);
});

test('waitForHttpReady gives a clear timeout error', async () => {
  await assert.rejects(
    waitForHttpReady({
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
      intervalMs: 1,
      timeoutMs: 5,
      url: 'http://127.0.0.1:4000/health',
    }),
    /API readiness timed out.*127\.0\.0\.1:4000\/health.*fetch failed/,
  );
});
