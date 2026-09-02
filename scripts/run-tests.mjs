import { spawnSync } from 'node:child_process';

import { loadTestEnvironment } from './test-database.mjs';

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (executable, args, environment = process.env) => {
  const result = spawnSync(executable, args, {
    env: environment,
    shell: process.platform === 'win32' && executable.endsWith('.cmd'),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, [
  '--test',
  'scripts/test-database.test.mjs',
  'scripts/dev-readiness.test.mjs',
  'scripts/dev-build-artifacts.test.mjs',
  'scripts/deployment-preflight.test.mjs',
]);
const { environment } = loadTestEnvironment();
run('docker', ['compose', 'up', '-d', 'postgres-test'], environment);

const deadline = Date.now() + 60_000;
while (true) {
  const ready = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres-test',
      'pg_isready',
      '-U',
      'mensah_test',
      '-d',
      'mensah_rentals_test',
    ],
    { env: environment, stdio: 'ignore' },
  );
  if (ready.status === 0) break;
  if (Date.now() >= deadline)
    throw new Error(
      'The isolated PostgreSQL test database did not become ready.',
    );
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

run(
  command,
  ['--filter', '@mensah-rentals/database', 'db:test:reset'],
  environment,
);
run(
  command,
  [
    'exec',
    'turbo',
    'run',
    'test',
    '--filter=!@mensah-rentals/api',
    '--filter=!@mensah-rentals/database',
  ],
  environment,
);
run(command, ['--filter', '@mensah-rentals/database', 'test'], environment);
run(command, ['--filter', '@mensah-rentals/api', 'test'], environment);
