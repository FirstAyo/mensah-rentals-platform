import { spawnSync } from 'node:child_process';

import { loadTestEnvironment } from './test-database.mjs';

const args = process.argv.slice(2);
if (!args.length) throw new Error('A test command is required.');
const { environment } = loadTestEnvironment();
const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(command, ['exec', ...args], {
  env: environment,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
