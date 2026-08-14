import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertDevelopmentTargetsAreFree,
  clearNextBuildArtifacts,
} from './dev-build-artifacts.mjs';

test('clearNextBuildArtifacts removes only known Next build directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mensah-dev-safe-'));
  try {
    await mkdir(join(root, 'apps', 'web', '.next'), { recursive: true });
    await mkdir(join(root, 'apps', 'admin', '.next'), { recursive: true });
    await writeFile(join(root, 'apps', 'web', '.next', 'routes.json'), '{}');
    await writeFile(join(root, 'apps', 'admin', '.next', 'routes.json'), '{}');
    await writeFile(join(root, 'keep.txt'), 'preserved');

    await clearNextBuildArtifacts({ repositoryRoot: root });

    await assert.rejects(
      readFile(join(root, 'apps', 'web', '.next', 'routes.json')),
    );
    await assert.rejects(
      readFile(join(root, 'apps', 'admin', '.next', 'routes.json')),
    );
    assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'preserved');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('assertDevelopmentTargetsAreFree rejects an occupied local target', async () => {
  await assert.rejects(
    assertDevelopmentTargetsAreFree({
      fetcher: async (url) => {
        if (String(url).includes('3000')) return new Response('ready');
        throw new TypeError('fetch failed');
      },
      targets: ['http://127.0.0.1:3000', 'http://127.0.0.1:4000/health'],
    }),
    /already running.*3000/,
  );
});

test('assertDevelopmentTargetsAreFree accepts unavailable targets', async () => {
  await assert.doesNotReject(
    assertDevelopmentTargetsAreFree({
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
      targets: ['http://127.0.0.1:3000'],
    }),
  );
});
