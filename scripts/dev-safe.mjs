import { spawn } from 'node:child_process';

import { waitForHttpReady } from './dev-readiness.mjs';

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const healthUrl =
  process.env.DEV_API_HEALTH_URL ?? 'http://127.0.0.1:4000/health';
const timeoutMs = Number(process.env.DEV_API_READY_TIMEOUT_MS ?? '120000');
const children = new Set();
let stopping = false;

function start(name, args) {
  const child = spawn(command, args, {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', (error) => {
    console.error(`[dev:safe] ${name} failed to start: ${error.message}`);
  });
  return child;
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}

process.once('SIGINT', stopAll);
process.once('SIGTERM', stopAll);

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error('DEV_API_READY_TIMEOUT_MS must be a positive number.');
}

console.log('[dev:safe] Starting API...');
const api = start('API', ['--filter', '@mensah-rentals/api', 'dev']);

try {
  await Promise.race([
    waitForHttpReady({ timeoutMs, url: healthUrl }),
    new Promise((_, reject) =>
      api.once('exit', (code) =>
        reject(
          new Error(
            `API process exited before becoming ready (exit code ${String(code)}).`,
          ),
        ),
      ),
    ),
  ]);
} catch (error) {
  stopAll();
  console.error(
    `[dev:safe] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
  process.exit();
}

console.log('[dev:safe] API is ready. Starting customer and admin apps...');
const web = start('customer website', [
  '--filter',
  '@mensah-rentals/web',
  'dev',
]);
const admin = start('admin dashboard', [
  '--filter',
  '@mensah-rentals/admin',
  'dev',
]);

const exitCode = await new Promise((resolve) => {
  for (const child of [api, web, admin]) {
    child.once('exit', (code) => resolve(code ?? 0));
  }
});
stopAll();
process.exitCode = exitCode;
