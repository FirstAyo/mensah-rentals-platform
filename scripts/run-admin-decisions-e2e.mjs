import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadTestEnvironment } from './test-database.mjs';

const mode = process.argv[2] ?? 'all';
const modes = new Set([
  'all',
  'approve',
  'partial',
  'reject',
  'quotes-admin',
  'quotes-customer',
  'quotes-all',
  'orders-admin',
  'orders-customer',
  'orders-all',
]);
if (!modes.has(mode)) throw new Error(`Unknown decision browser mode: ${mode}`);

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const run = (executable, args, environment) => {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: environment,
    shell: process.platform === 'win32' && executable.endsWith('.cmd'),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${executable} ${args.join(' ')} failed with exit code ${result.status ?? 1}.`,
    );
};

async function ensurePortsAreFree() {
  for (const url of [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000/health',
  ]) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1_000) });
      throw new Error(
        `Refusing isolated browser tests because ${url} is already running. Stop normal development servers first.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Refusing'))
        throw error;
    }
  }
}

async function waitFor(url, label) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {
      // Connection failures are expected while the applications start.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${label} did not become ready at ${url}.`);
}

function stopTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
  } else process.kill(-child.pid, 'SIGTERM');
}

await ensurePortsAreFree();
const { environment } = loadTestEnvironment();
const browserEnvironment = {
  ...environment,
  MENSAH_ISOLATED_E2E: 'verified-local-test-database',
  STAFF_BOOTSTRAP_EMAIL: 'phase10-browser@example.test',
  STAFF_BOOTSTRAP_FIRST_NAME: 'Phase Ten',
  STAFF_BOOTSTRAP_LAST_NAME: 'Browser',
  STAFF_BOOTSTRAP_PASSWORD: `${randomBytes(24).toString('base64url')}Aa1!`,
};
process.env.DATABASE_URL = browserEnvironment.DATABASE_URL;
process.env.NODE_ENV = 'test';

run('docker', ['compose', 'up', '-d', 'postgres-test'], browserEnvironment);
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
    { env: browserEnvironment, stdio: 'ignore' },
  );
  if (ready.status === 0) break;
  if (Date.now() >= deadline)
    throw new Error(
      'The isolated PostgreSQL browser-test database is not ready.',
    );
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

run(
  pnpm,
  ['--filter', '@mensah-rentals/database', 'db:test:reset'],
  browserEnvironment,
);
run(
  pnpm,
  ['exec', 'turbo', 'run', 'build', '--filter=@mensah-rentals/database'],
  browserEnvironment,
);
for (const script of [
  'seed-rbac.js',
  'bootstrap-staff.js',
  'seed-catalogue.js',
])
  run(
    process.execPath,
    [`packages/database/dist/scripts/${script}`],
    script !== 'seed-rbac.js'
      ? { ...browserEnvironment, NODE_ENV: 'development' }
      : browserEnvironment,
  );

const [{ prisma }, { verifyPassword }] = await Promise.all([
  import('../packages/database/dist/index.js'),
  import('../packages/auth/dist/index.js'),
]);
const fixture = await prisma.user.findUnique({
  where: { email: browserEnvironment.STAFF_BOOTSTRAP_EMAIL },
  select: { passwordHash: true, status: true },
});
if (
  !fixture ||
  fixture.status !== 'ACTIVE' ||
  !(await verifyPassword(
    fixture.passwordHash,
    browserEnvironment.STAFF_BOOTSTRAP_PASSWORD,
  ))
)
  throw new Error('The isolated browser staff fixture failed verification.');
await prisma.$disconnect();

const servers = [
  '@mensah-rentals/web',
  '@mensah-rentals/admin',
  '@mensah-rentals/api',
].map((workspace) =>
  spawn(pnpm, ['--filter', workspace, 'dev'], {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    env: browserEnvironment,
    shell: process.platform === 'win32',
    stdio: 'ignore',
  }),
);
try {
  await Promise.all([
    waitFor('http://localhost:3000/rentals', 'Customer website'),
    waitFor('http://localhost:3001/login', 'Admin application'),
    waitFor('http://localhost:4000/health/database', 'API database health'),
  ]);
  const loginCheck = await fetch('http://localhost:4000/auth/login', {
    body: JSON.stringify({
      email: browserEnvironment.STAFF_BOOTSTRAP_EMAIL,
      password: browserEnvironment.STAFF_BOOTSTRAP_PASSWORD,
    }),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3001',
    },
    method: 'POST',
  });
  if (!loginCheck.ok)
    throw new Error(
      `The isolated API rejected its verified test fixture (HTTP ${loginCheck.status}).`,
    );
  const isQuoteMode = mode.startsWith('quotes-');
  const isOrderMode = mode.startsWith('orders-');
  const grep = isOrderMode
    ? mode === 'orders-all'
      ? '@orders'
      : mode === 'orders-admin'
        ? '@admin-orders'
        : '@customer-orders'
    : isQuoteMode
      ? mode === 'quotes-all'
        ? '@quotes'
        : mode === 'quotes-admin'
          ? '@admin-quotes'
          : '@customer-quotes'
      : mode === 'all'
        ? '@admin-decisions'
        : `@admin-decisions-${mode}`;
  run(
    pnpm,
    [
      '--filter',
      '@mensah-rentals/web',
      'exec',
      'playwright',
      'test',
      isOrderMode
        ? 'e2e/orders.spec.ts'
        : isQuoteMode
          ? 'e2e/quotes.spec.ts'
          : 'e2e/admin-decisions.spec.ts',
      '--grep',
      grep,
    ],
    browserEnvironment,
  );
} finally {
  for (const server of servers) stopTree(server);
}
