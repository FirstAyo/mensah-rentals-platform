import { randomBytes, randomUUID } from 'node:crypto';
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
  'phase12-1-layout',
  'phase12-1-quote',
  'phase12-1-order',
  'reservations-admin',
  'reservations-concurrency',
  'reservations-all',
  'fulfilment-admin',
  'fulfilment-active-rentals',
  'fulfilment-concurrency',
  'fulfilment-all',
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

async function waitFor(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
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
  select: { id: true, passwordHash: true, status: true },
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
if (mode.startsWith('reservations-') || mode.startsWith('fulfilment-')) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  for (const product of products) {
    const existing = await prisma.inventory.findUnique({
      where: { productId: product.id },
    });
    if (existing) continue;
    const inventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Isolated Phase 14 browser fixture',
        initialState: 'RENTABLE',
        productId: product.id,
        trackingMode: 'BULK',
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        actorUserId: fixture.id,
        inventoryId: inventory.id,
        kind: 'INITIAL_STOCK',
        operationId: randomUUID(),
        quantity: 2,
        reason: 'Isolated Phase 14 browser fixture',
        toState: 'RENTABLE',
      },
    });
  }
  if (mode.startsWith('fulfilment-')) {
    const source = products[0];
    if (!source)
      throw new Error('A catalogue product is required for fulfilment tests.');
    const deliveryProductName = 'Phase 15 Delivery Package';
    const deliveryProduct = await prisma.product.create({
      data: {
        categoryId: source.categoryId,
        name: deliveryProductName,
        shortDescription: 'Isolated full delivery browser fixture',
        slug: `phase-15-delivery-${randomUUID()}`,
      },
    });
    const deliveryInventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Isolated Phase 15 delivery browser fixture',
        initialState: 'RENTABLE',
        productId: deliveryProduct.id,
        trackingMode: 'BULK',
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        actorUserId: fixture.id,
        inventoryId: deliveryInventory.id,
        kind: 'INITIAL_STOCK',
        operationId: randomUUID(),
        quantity: 2,
        reason: 'Isolated Phase 15 delivery browser fixture',
        toState: 'RENTABLE',
      },
    });
    browserEnvironment.PHASE15_DELIVERY_PRODUCT_NAME = deliveryProductName;
    const serializedProductName = 'Phase 15 Serialized Camera';
    const serializedProduct = await prisma.product.create({
      data: {
        categoryId: source.categoryId,
        name: serializedProductName,
        shortDescription: 'Isolated serialized fulfilment browser fixture',
        slug: `phase-15-serialized-${randomUUID()}`,
      },
    });
    const serializedInventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Isolated Phase 15 serialized browser fixture',
        initialState: 'RENTABLE',
        productId: serializedProduct.id,
        trackingMode: 'SERIALIZED',
      },
    });
    const assetNumber = `P15-E2E-${randomUUID().slice(0, 8).toUpperCase()}`;
    await prisma.inventoryItem.create({
      data: {
        assetNumber,
        inventoryId: serializedInventory.id,
        serialNumber: `P15-SERIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    browserEnvironment.PHASE15_SERIALIZED_PRODUCT_NAME = serializedProductName;
    browserEnvironment.PHASE15_SERIALIZED_ASSET_NUMBER = assetNumber;
  }
}
if (mode === 'phase12-1-layout') {
  const product = await prisma.product.findFirstOrThrow({
    where: { isActive: true },
    include: { category: true },
    orderBy: { createdAt: 'asc' },
  });
  const rentalStartDate = new Date();
  rentalStartDate.setUTCDate(rentalStartDate.getUTCDate() + 10);
  await prisma.rentalRequest.create({
    data: {
      referenceNumber: 'MR-2026-P121E2ETST',
      submissionKeyHash: '1'.repeat(64),
      submissionPayloadHash: '2'.repeat(64),
      sourceCartTokenHash: '3'.repeat(64),
      fulfillmentMethod: 'PICKUP',
      contactFirstName: 'Actionable',
      contactLastName: 'Work',
      contactEmail: 'phase12-1-layout@example.test',
      contactPhone: '+233 20 000 0121',
      projectName: 'Phase 12.1 layout verification',
      projectType: 'Automated test',
      projectLocation: 'Accra',
      rentalStartDate,
      rentalEndDate: new Date(
        rentalStartDate.getTime() + 2 * 24 * 60 * 60 * 1_000,
      ),
      requestedTimeZone: 'Africa/Accra',
      items: {
        create: {
          productId: product.id,
          requestedQuantity: 2,
          productName: product.name,
          productSlug: product.slug,
          categoryName: product.category.name,
          categorySlug: product.category.slug,
          rentalUnit: product.rentalUnit,
        },
      },
    },
  });
}
if (mode === 'phase12-1-quote' || mode === 'phase12-1-order') {
  const product = await prisma.product.findFirstOrThrow({
    where: { isActive: true },
    include: { category: true },
    orderBy: { createdAt: 'asc' },
  });
  const isQuote = mode === 'phase12-1-quote';
  const referenceNumber = isQuote ? 'MR-2026-P121QUOT01' : 'MR-2026-P121ORDR01';
  const projectName = isQuote
    ? 'Phase 12.1 quote fixture'
    : 'Phase 12.1 order fixture';
  const rentalStartDate = new Date();
  rentalStartDate.setUTCDate(rentalStartDate.getUTCDate() + 7);
  const request = await prisma.rentalRequest.create({
    data: {
      referenceNumber,
      submissionKeyHash: (isQuote ? '4' : '7').repeat(64),
      submissionPayloadHash: (isQuote ? '5' : '8').repeat(64),
      sourceCartTokenHash: (isQuote ? '6' : '9').repeat(64),
      fulfillmentMethod: 'PICKUP',
      contactFirstName: isQuote ? 'Quote' : 'Order',
      contactLastName: 'Customer',
      contactEmail: `${mode}@example.test`,
      contactPhone: '+233 20 000 0121',
      projectName,
      projectType: 'Automated test',
      projectLocation: 'Accra',
      rentalStartDate,
      rentalEndDate: new Date(
        rentalStartDate.getTime() + 2 * 24 * 60 * 60 * 1_000,
      ),
      requestedTimeZone: 'Africa/Accra',
      reviewStartedAt: new Date(),
      reviewVersion: 1,
      status: 'UNDER_REVIEW',
      items: {
        create: {
          productId: product.id,
          requestedQuantity: 3,
          productName: product.name,
          productSlug: product.slug,
          categoryName: product.category.name,
          categorySlug: product.category.slug,
          rentalUnit: product.rentalUnit,
        },
      },
    },
    include: { items: true },
  });
  await prisma.$transaction(async (tx) => {
    const decision = await tx.rentalRequestDecision.create({
      data: {
        rentalRequestId: request.id,
        outcome: 'APPROVED',
        decidedByUserId: fixture.id,
        operationId: randomUUID(),
        payloadHash: 'a'.repeat(64),
        internalReason: 'Isolated Phase 12.1 browser fixture',
        reviewVersionBefore: 1,
        reviewVersionAfter: 2,
        items: {
          create: request.items.map((item) => ({
            rentalRequestItemId: item.id,
            requestedQuantitySnapshot: item.requestedQuantity,
            approvedQuantity: item.requestedQuantity,
          })),
        },
      },
    });
    await tx.rentalRequestActivity.create({
      data: {
        rentalRequestId: request.id,
        actorUserId: fixture.id,
        decisionId: decision.id,
        previousStatus: 'UNDER_REVIEW',
        newStatus: 'APPROVED',
        type: 'APPROVED',
      },
    });
    await tx.rentalRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewVersion: 2 },
    });
  });
  browserEnvironment.PHASE121_APPROVED_REQUEST_ID = request.id;
  browserEnvironment.PHASE121_REQUEST_REFERENCE = referenceNumber;
  browserEnvironment.PHASE121_PROJECT_NAME = projectName;
}
await prisma.$disconnect();

const phase121Mode = mode.startsWith('phase12-1-');
const reservationMode = mode.startsWith('reservations-');
const fulfilmentMode = mode.startsWith('fulfilment-');
if (phase121Mode || reservationMode || fulfilmentMode)
  run(
    pnpm,
    [
      'exec',
      'turbo',
      'run',
      'build',
      '--cache=local:r,remote:r',
      '--filter=@mensah-rentals/web',
      '--filter=@mensah-rentals/admin',
      '--filter=@mensah-rentals/api',
    ],
    browserEnvironment,
  );
const servers = [
  '@mensah-rentals/web',
  '@mensah-rentals/admin',
  '@mensah-rentals/api',
].map((workspace) =>
  spawn(
    pnpm,
    [
      '--filter',
      workspace,
      phase121Mode || (fulfilmentMode && workspace !== '@mensah-rentals/web')
        ? 'start'
        : 'dev',
    ],
    {
      cwd: repositoryRoot,
      detached: process.platform !== 'win32',
      env: browserEnvironment,
      shell: process.platform === 'win32',
      stdio: 'ignore',
    },
  ),
);
try {
  await Promise.all([
    waitFor(
      'http://localhost:3000/rentals',
      'Customer website',
      fulfilmentMode ? 180_000 : 90_000,
    ),
    waitFor(
      'http://localhost:3001/login',
      'Admin application',
      fulfilmentMode ? 180_000 : 90_000,
    ),
    waitFor(
      'http://localhost:4000/health/database',
      'API database health',
      fulfilmentMode ? 180_000 : 90_000,
    ),
  ]);
  const isPhase121 = phase121Mode;
  const isPhase121Layout = mode === 'phase12-1-layout';
  const isPhase121Quote = mode === 'phase12-1-quote';
  const isQuoteMode = mode.startsWith('quotes-');
  const isOrderMode = mode.startsWith('orders-');
  const grep = fulfilmentMode
    ? mode === 'fulfilment-all'
      ? '@fulfilment'
      : mode === 'fulfilment-concurrency'
        ? '@fulfilment-concurrency'
        : mode === 'fulfilment-active-rentals'
          ? '@active-rentals'
          : '@admin-fulfilment'
    : reservationMode
      ? mode === 'reservations-all'
        ? '@reservations'
        : mode === 'reservations-concurrency'
          ? '@reservation-concurrency'
          : '@admin-reservations'
      : isPhase121
        ? '@phase12-1'
        : isOrderMode
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
  const grepArgument =
    process.platform === 'win32' && grep.includes('|') ? `"${grep}"` : grep;
  run(
    pnpm,
    [
      '--filter',
      '@mensah-rentals/web',
      'exec',
      'playwright',
      'test',
      ...(reservationMode || fulfilmentMode
        ? ['e2e/orders.spec.ts']
        : isPhase121
          ? [
              isPhase121Layout
                ? 'e2e/phase12-1.spec.ts'
                : isPhase121Quote
                  ? 'e2e/quotes.spec.ts'
                  : 'e2e/orders.spec.ts',
            ]
          : [
              isOrderMode
                ? 'e2e/orders.spec.ts'
                : isQuoteMode
                  ? 'e2e/quotes.spec.ts'
                  : 'e2e/admin-decisions.spec.ts',
            ]),
      '--grep',
      grepArgument,
    ],
    browserEnvironment,
  );
} finally {
  for (const server of servers) stopTree(server);
}
