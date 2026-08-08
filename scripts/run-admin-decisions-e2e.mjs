import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  'returns-admin',
  'returns-issues',
  'returns-concurrency',
  'returns-all',
  'maintenance',
  'inspections',
  'maintenance-all',
  'categories',
  'products',
  'catalogue',
  'cart',
  'homepage',
  'homepage-admin',
  'homepage-media',
  'homepage-google-reviews',
  'homepage-google-live',
  'homepage-google-timeout',
  'homepage-google-quota',
  'homepage-all',
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
  AUTH_LOGIN_RATE_LIMIT: '100',
  MENSAH_ISOLATED_E2E: 'verified-local-test-database',
  MEDIA_STORAGE_ROOT: 'storage/test-media',
  STAFF_BOOTSTRAP_EMAIL: 'phase10-browser@example.test',
  STAFF_BOOTSTRAP_FIRST_NAME: 'Phase Ten',
  STAFF_BOOTSTRAP_LAST_NAME: 'Browser',
  STAFF_BOOTSTRAP_PASSWORD: `${randomBytes(24).toString('base64url')}Aa1!`,
};
if (mode.startsWith('homepage-google-')) {
  browserEnvironment.GOOGLE_REVIEWS_LIVE_ENABLED = 'true';
  browserEnvironment.GOOGLE_PLACES_API_KEY = 'test-owned-server-key';
  browserEnvironment.GOOGLE_BUSINESS_PLACE_ID = 'ChIJE2EGoogleReviews';
  browserEnvironment.GOOGLE_PLACES_LANGUAGE_CODE = 'en-CA';
  browserEnvironment.GOOGLE_PLACES_REGION_CODE = 'CA';
  browserEnvironment.GOOGLE_PLACES_TIMEOUT_MS = '250';
  browserEnvironment.GOOGLE_REVIEWS_URL =
    'https://www.google.com/maps/place/mensah-test';
  browserEnvironment.GOOGLE_WRITE_REVIEW_URL =
    'https://www.google.com/maps/reviews/write-test';
  browserEnvironment.GOOGLE_PLACES_E2E_SCENARIO = mode.endsWith('-timeout')
    ? 'TIMEOUT'
    : mode.endsWith('-quota')
      ? 'QUOTA'
      : 'LIVE';
  browserEnvironment.NODE_OPTIONS =
    `${browserEnvironment.NODE_OPTIONS ?? ''} --require="${resolve(
      repositoryRoot,
      'scripts/google-places-e2e-fetch-mock.cjs',
    ).replaceAll('\\', '/')}"`.trim();
}
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

const [{ prisma }, { hashPassword, verifyPassword }] = await Promise.all([
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
if (
  mode.startsWith('reservations-') ||
  mode.startsWith('fulfilment-') ||
  mode.startsWith('returns-') ||
  mode === 'maintenance' ||
  mode === 'inspections' ||
  mode === 'maintenance-all'
) {
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
  if (mode.startsWith('fulfilment-') || mode.startsWith('returns-')) {
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
    if (mode.startsWith('returns-')) {
      for (const [environmentKey, productName] of [
        ['PHASE16_ADMIN_RETURN_PRODUCT_NAME', 'Phase 16 Admin Return Package'],
        ['PHASE16_ISSUE_RETURN_PRODUCT_NAME', 'Phase 16 Issue Return Package'],
        [
          'PHASE16_CONCURRENCY_RETURN_PRODUCT_NAME',
          'Phase 16 Concurrency Return Package',
        ],
      ]) {
        const returnProduct = await prisma.product.create({
          data: {
            categoryId: source.categoryId,
            name: productName,
            shortDescription: 'Isolated Phase 16 return browser fixture',
            slug: `phase-16-return-${randomUUID()}`,
          },
        });
        const returnInventory = await prisma.inventory.create({
          data: {
            creationOperationId: randomUUID(),
            creationReason: 'Isolated Phase 16 return browser fixture',
            initialState: 'RENTABLE',
            productId: returnProduct.id,
            trackingMode: 'BULK',
          },
        });
        await prisma.inventoryTransaction.create({
          data: {
            actorUserId: fixture.id,
            inventoryId: returnInventory.id,
            kind: 'INITIAL_STOCK',
            operationId: randomUUID(),
            quantity:
              environmentKey === 'PHASE16_ISSUE_RETURN_PRODUCT_NAME' ? 3 : 2,
            reason: 'Isolated Phase 16 return browser fixture',
            toState: 'RENTABLE',
          },
        });
        browserEnvironment[environmentKey] = productName;
      }
    }
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
if (
  mode === 'maintenance' ||
  mode === 'inspections' ||
  mode === 'maintenance-all'
) {
  const marker = randomUUID().replaceAll('-', '');
  const viewPassword = `${randomBytes(24).toString('base64url')}Aa1!`;
  const salesPassword = `${randomBytes(24).toString('base64url')}Aa1!`;
  const disabledPassword = `${randomBytes(24).toString('base64url')}Aa1!`;
  const maintenanceView = await prisma.permission.findUniqueOrThrow({
    where: { key: 'maintenance.view' },
  });
  const viewRole = await prisma.role.create({
    data: {
      name: `P17_VIEW_${marker.slice(0, 8).toUpperCase()}`,
      displayName: 'Phase 17 maintenance viewer',
      permissions: {
        create: { permissionId: maintenanceView.id },
      },
    },
  });
  const salesRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'SALES_PERSON' },
  });
  const viewUser = await prisma.user.create({
    data: {
      email: `phase17-view-${marker}@example.test`,
      firstName: 'Maintenance',
      lastName: 'Viewer',
      passwordHash: await hashPassword(viewPassword),
      roles: { create: { roleId: viewRole.id } },
      status: 'ACTIVE',
    },
  });
  const salesUser = await prisma.user.create({
    data: {
      email: `phase17-sales-${marker}@example.test`,
      firstName: 'Phase',
      lastName: 'Sales',
      passwordHash: await hashPassword(salesPassword),
      roles: { create: { roleId: salesRole.id } },
      status: 'ACTIVE',
    },
  });
  const disabledRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'SUPER_ADMIN' },
  });
  const disabledUser = await prisma.user.create({
    data: {
      email: `phase17-disabled-${marker}@example.test`,
      firstName: 'Disabled',
      lastName: 'Maintainer',
      passwordHash: await hashPassword(disabledPassword),
      roles: { create: { roleId: disabledRole.id } },
      status: 'DISABLED',
    },
  });
  browserEnvironment.PHASE17_VIEW_EMAIL = viewUser.email;
  browserEnvironment.PHASE17_VIEW_PASSWORD = viewPassword;
  browserEnvironment.PHASE17_SALES_EMAIL = salesUser.email;
  browserEnvironment.PHASE17_SALES_PASSWORD = salesPassword;
  browserEnvironment.PHASE17_DISABLED_EMAIL = disabledUser.email;
  browserEnvironment.PHASE17_DISABLED_PASSWORD = disabledPassword;

  const source = await prisma.product.findFirstOrThrow({
    where: { isActive: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const createBulkFixture = async (name, initialState, quantity) => {
    const product = await prisma.product.create({
      data: {
        categoryId: source.categoryId,
        name,
        shortDescription: 'Test-owned Phase 17 maintenance fixture',
        slug: `phase-17-${randomUUID()}`,
      },
    });
    const inventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Test-owned Phase 17 maintenance fixture',
        initialState,
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
        quantity,
        reason: 'Test-owned Phase 17 maintenance fixture',
        toState: initialState,
      },
    });
    return { inventory, product };
  };
  const preventive = await createBulkFixture(
    'Phase 17 Preventive Bulk Equipment',
    'RENTABLE',
    4,
  );
  const damaged = await createBulkFixture(
    'Phase 17 Damaged Bulk Equipment',
    'DAMAGED',
    3,
  );
  const permissionTarget = await createBulkFixture(
    'Phase 17 Permission Boundary Equipment',
    'RENTABLE',
    1,
  );
  const serializedProduct = await prisma.product.create({
    data: {
      categoryId: source.categoryId,
      name: 'Phase 17 Serialized Equipment',
      shortDescription: 'Test-owned Phase 17 serialized fixture',
      slug: `phase-17-serialized-${randomUUID()}`,
    },
  });
  const serializedInventory = await prisma.inventory.create({
    data: {
      creationOperationId: randomUUID(),
      creationReason: 'Test-owned Phase 17 serialized fixture',
      initialState: 'RENTABLE',
      productId: serializedProduct.id,
      trackingMode: 'SERIALIZED',
    },
  });
  const assetNumber = `P17-E2E-${randomUUID().slice(0, 8).toUpperCase()}`;
  const serializedItem = await prisma.inventoryItem.create({
    data: {
      assetNumber,
      inventoryId: serializedInventory.id,
      serialNumber: `P17-SERIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: 'RENTABLE',
    },
  });
  await prisma.inventoryTransaction.create({
    data: {
      actorUserId: fixture.id,
      inventoryId: serializedInventory.id,
      inventoryItemId: serializedItem.id,
      kind: 'SERIALIZED_ITEM_CREATED',
      operationId: randomUUID(),
      quantity: 1,
      reason: 'Test-owned Phase 17 serialized fixture',
      toState: 'RENTABLE',
    },
  });
  browserEnvironment.PHASE17_PREVENTIVE_PRODUCT_NAME = preventive.product.name;
  browserEnvironment.PHASE17_PREVENTIVE_INVENTORY_ID = preventive.inventory.id;
  browserEnvironment.PHASE17_DAMAGED_PRODUCT_NAME = damaged.product.name;
  browserEnvironment.PHASE17_DAMAGED_INVENTORY_ID = damaged.inventory.id;
  browserEnvironment.PHASE17_PERMISSION_INVENTORY_ID =
    permissionTarget.inventory.id;
  browserEnvironment.PHASE17_SERIALIZED_PRODUCT_NAME = serializedProduct.name;
  browserEnvironment.PHASE17_SERIALIZED_INVENTORY_ID = serializedInventory.id;
  browserEnvironment.PHASE17_SERIALIZED_ITEM_ID = serializedItem.id;
  browserEnvironment.PHASE17_SERIALIZED_ASSET_NUMBER = assetNumber;
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
if (mode === 'categories') {
  const marker = randomUUID().replaceAll('-', '');
  const emptyCategory = await prisma.category.create({
    data: {
      name: `Phase 16.2 Empty ${marker.slice(0, 8)}`,
      slug: `phase-16-2-empty-${marker}`,
    },
  });
  const historyCategory = await prisma.category.create({
    data: {
      name: `Phase 16.2 History ${marker.slice(0, 8)}`,
      slug: `phase-16-2-history-${marker}`,
    },
  });
  const product = await prisma.product.create({
    data: {
      categoryId: historyCategory.id,
      name: `Phase 16.2 Referenced product ${marker.slice(0, 8)}`,
      slug: `phase-16-2-referenced-${marker}`,
      shortDescription: 'Test-owned referenced product',
    },
  });
  const referenceNumber = `MR-2026-${marker.slice(0, 10).toUpperCase()}`;
  await prisma.$transaction(async (tx) => {
    const created = await tx.rentalRequest.create({
      data: {
        contactEmail: 'phase16-2@example.test',
        contactFirstName: 'Phase',
        contactLastName: 'Sixteen',
        contactPhone: '+15555550162',
        fulfillmentMethod: 'PICKUP',
        projectLocation: 'Test location',
        projectName: 'Phase 16.2 retention fixture',
        projectType: 'Automated test',
        referenceNumber,
        rentalEndDate: new Date('2027-02-02T00:00:00.000Z'),
        rentalStartDate: new Date('2027-02-01T00:00:00.000Z'),
        requestedTimeZone: 'UTC',
        sourceCartTokenHash: randomBytes(32).toString('hex'),
        submissionKeyHash: randomBytes(32).toString('hex'),
        submissionPayloadHash: randomBytes(32).toString('hex'),
        items: {
          create: {
            categoryName: historyCategory.name,
            categorySlug: historyCategory.slug,
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            rentalUnit: 'each',
            requestedQuantity: 2,
          },
        },
      },
      include: { items: true },
    });
    const revision = await tx.rentalRequestRevision.create({
      data: {
        amendmentReason: null,
        companyName: created.companyName,
        contactEmail: created.contactEmail,
        contactFirstName: created.contactFirstName,
        contactLastName: created.contactLastName,
        contactPhone: created.contactPhone,
        customerNotes: created.customerNotes,
        deliveryAddress: created.deliveryAddress,
        fulfillmentMethod: created.fulfillmentMethod,
        operationId: randomUUID(),
        payloadHash: randomBytes(32).toString('hex'),
        projectLocation: created.projectLocation,
        projectName: created.projectName,
        projectType: created.projectType,
        rentalEndDate: created.rentalEndDate,
        rentalRequestId: created.id,
        rentalStartDate: created.rentalStartDate,
        requestedTimeZone: created.requestedTimeZone,
        revisionNumber: 1,
        submittedByType: 'ORIGINAL_SUBMISSION',
        items: {
          create: created.items.map((item, sortOrder) => ({
            categoryNameSnapshot: item.categoryName,
            categorySlugSnapshot: item.categorySlug,
            primaryImageUrlSnapshot: null,
            productId: item.productId,
            productNameSnapshot: item.productName,
            productSlugSnapshot: item.productSlug,
            rentalUnitSnapshot: item.rentalUnit,
            requestedQuantity: item.requestedQuantity,
            sortOrder,
          })),
        },
      },
    });
    await tx.rentalRequest.update({
      where: { id: created.id },
      data: { currentRevisionId: revision.id },
    });
  });
  browserEnvironment.PHASE16_2_EMPTY_CATEGORY_NAME = emptyCategory.name;
  browserEnvironment.PHASE16_2_HISTORY_CATEGORY_NAME = historyCategory.name;
  browserEnvironment.PHASE16_2_HISTORY_PRODUCT_NAME = product.name;
  browserEnvironment.PHASE16_2_HISTORY_PRODUCT_SLUG = product.slug;
  browserEnvironment.PHASE16_2_REQUEST_REFERENCE = referenceNumber;
}
if (mode === 'products') {
  const marker = randomUUID().replaceAll('-', '');
  const editorPassword = `${randomBytes(24).toString('base64url')}Aa1!`;
  const editorRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'EDITOR' },
  });
  const editor = await prisma.user.create({
    data: {
      email: `phase16-3-editor-${marker}@example.test`,
      firstName: 'Phase',
      lastName: 'Editor',
      passwordHash: await hashPassword(editorPassword),
      roles: { create: { roleId: editorRole.id } },
      status: 'ACTIVE',
    },
  });
  const sourceCategory = await prisma.category.findFirstOrThrow({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const duplicateProduct = await prisma.product.findFirstOrThrow({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const targetCategory = await prisma.category.create({
    data: {
      name: `Phase 16.3 Target ${marker.slice(0, 8)}`,
      slug: `phase-16-3-target-${marker}`,
    },
  });
  const unreferencedProduct = await prisma.product.create({
    data: {
      categoryId: sourceCategory.id,
      name: `Phase 16.3 Disposable ${marker.slice(0, 8)}`,
      slug: `phase-16-3-disposable-${marker}`,
      shortDescription: 'Test-owned unreferenced product',
    },
  });
  const referencedProduct = await prisma.product.create({
    data: {
      categoryId: sourceCategory.id,
      name: `Phase 16.3 Referenced ${marker.slice(0, 8)}`,
      slug: `phase-16-3-referenced-${marker}`,
      shortDescription: 'Test-owned referenced product',
    },
  });
  const referenceNumber = `MR-2026-${marker.slice(0, 10).toUpperCase()}`;
  await prisma.$transaction(async (tx) => {
    const created = await tx.rentalRequest.create({
      data: {
        contactEmail: 'phase16-3@example.test',
        contactFirstName: 'Phase',
        contactLastName: 'Sixteen',
        contactPhone: '+15555550163',
        fulfillmentMethod: 'PICKUP',
        projectLocation: 'Test location',
        projectName: 'Phase 16.3 retention fixture',
        projectType: 'Automated test',
        referenceNumber,
        rentalEndDate: new Date('2027-03-02T00:00:00.000Z'),
        rentalStartDate: new Date('2027-03-01T00:00:00.000Z'),
        requestedTimeZone: 'UTC',
        sourceCartTokenHash: randomBytes(32).toString('hex'),
        submissionKeyHash: randomBytes(32).toString('hex'),
        submissionPayloadHash: randomBytes(32).toString('hex'),
        items: {
          create: {
            categoryName: sourceCategory.name,
            categorySlug: sourceCategory.slug,
            productId: referencedProduct.id,
            productName: referencedProduct.name,
            productSlug: referencedProduct.slug,
            rentalUnit: 'each',
            requestedQuantity: 2,
          },
        },
      },
      include: { items: true },
    });
    const revision = await tx.rentalRequestRevision.create({
      data: {
        amendmentReason: null,
        companyName: created.companyName,
        contactEmail: created.contactEmail,
        contactFirstName: created.contactFirstName,
        contactLastName: created.contactLastName,
        contactPhone: created.contactPhone,
        customerNotes: created.customerNotes,
        deliveryAddress: created.deliveryAddress,
        fulfillmentMethod: created.fulfillmentMethod,
        operationId: randomUUID(),
        payloadHash: randomBytes(32).toString('hex'),
        projectLocation: created.projectLocation,
        projectName: created.projectName,
        projectType: created.projectType,
        rentalEndDate: created.rentalEndDate,
        rentalRequestId: created.id,
        rentalStartDate: created.rentalStartDate,
        requestedTimeZone: created.requestedTimeZone,
        revisionNumber: 1,
        submittedByType: 'ORIGINAL_SUBMISSION',
        items: {
          create: created.items.map((item, sortOrder) => ({
            categoryNameSnapshot: item.categoryName,
            categorySlugSnapshot: item.categorySlug,
            primaryImageUrlSnapshot: null,
            productId: item.productId,
            productNameSnapshot: item.productName,
            productSlugSnapshot: item.productSlug,
            rentalUnitSnapshot: item.rentalUnit,
            requestedQuantity: item.requestedQuantity,
            sortOrder,
          })),
        },
      },
    });
    await tx.rentalRequest.update({
      where: { id: created.id },
      data: { currentRevisionId: revision.id },
    });
  });
  browserEnvironment.PHASE16_3_DISPOSABLE_PRODUCT_NAME =
    unreferencedProduct.name;
  browserEnvironment.PHASE16_3_REFERENCED_PRODUCT_NAME = referencedProduct.name;
  browserEnvironment.PHASE16_3_REFERENCED_PRODUCT_SLUG = referencedProduct.slug;
  browserEnvironment.PHASE16_3_DUPLICATE_PRODUCT_SLUG = duplicateProduct.slug;
  browserEnvironment.PHASE16_3_TARGET_CATEGORY_NAME = targetCategory.name;
  browserEnvironment.PHASE16_3_TARGET_CATEGORY_SLUG = targetCategory.slug;
  browserEnvironment.PHASE16_3_REQUEST_REFERENCE = referenceNumber;
  browserEnvironment.PHASE16_3_EDITOR_EMAIL = editor.email;
  browserEnvironment.PHASE16_3_EDITOR_PASSWORD = editorPassword;
}
if (mode.startsWith('homepage')) {
  const product = await prisma.product.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { category: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (!product) throw new Error('Homepage browser fixture needs a product.');
  const { default: sharp } = await import(
    '../apps/api/node_modules/sharp/dist/index.mjs'
  );
  const productBuffer = await sharp({
    create: {
      width: 640,
      height: 420,
      channels: 3,
      background: { r: 35, g: 71, b: 118 },
    },
  })
    .webp({ quality: 82 })
    .toBuffer();
  const contentHash = createHash('sha256').update(productBuffer).digest('hex');
  const mediaDirectory = resolve(
    repositoryRoot,
    browserEnvironment.MEDIA_STORAGE_ROOT,
    'products',
    product.id,
  );
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(
    resolve(mediaDirectory, `${contentHash}.webp`),
    productBuffer,
  );
  await prisma.productImage.create({
    data: {
      productId: product.id,
      url: `/media/products/${product.id}/${contentHash}.webp`,
      altText: 'Existing blue product media fixture',
      sortOrder: 0,
      isPrimary: true,
    },
  });
  browserEnvironment.PHASE16_4A_CATEGORY_ID = product.categoryId;
  browserEnvironment.PHASE16_4A_CATEGORY_NAME = product.category.name;
  browserEnvironment.PHASE16_4A_PRODUCT_IMAGE_LABEL =
    'Existing blue product media fixture';
}
await prisma.$disconnect();

const phase121Mode = mode.startsWith('phase12-1-');
const categoryMode = mode === 'categories';
const productMode = mode === 'products';
const reservationMode = mode.startsWith('reservations-');
const fulfilmentMode = mode.startsWith('fulfilment-');
const returnMode = mode.startsWith('returns-');
const maintenanceMode =
  mode === 'maintenance' ||
  mode === 'inspections' ||
  mode === 'maintenance-all';
const homepageMode = mode.startsWith('homepage');
const publicRegressionMode = mode === 'catalogue' || mode === 'cart';
const productionPublicRegressionMode = mode === 'catalogue';
if (
  phase121Mode ||
  categoryMode ||
  productMode ||
  reservationMode ||
  fulfilmentMode ||
  returnMode ||
  maintenanceMode ||
  homepageMode ||
  publicRegressionMode
)
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
      phase121Mode ||
      categoryMode ||
      productMode ||
      homepageMode ||
      productionPublicRegressionMode ||
      ((fulfilmentMode || returnMode || maintenanceMode) &&
        workspace !== '@mensah-rentals/web')
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
      reservationMode || fulfilmentMode || returnMode || maintenanceMode
        ? 180_000
        : 90_000,
    ),
    waitFor(
      'http://localhost:3001/login',
      'Admin application',
      reservationMode || fulfilmentMode || returnMode || maintenanceMode
        ? 180_000
        : 90_000,
    ),
    waitFor(
      'http://localhost:4000/health/database',
      'API database health',
      reservationMode || fulfilmentMode || returnMode || maintenanceMode
        ? 180_000
        : 90_000,
    ),
  ]);
  const isPhase121 = phase121Mode;
  const isPhase121Layout = mode === 'phase12-1-layout';
  const isPhase121Quote = mode === 'phase12-1-quote';
  const isQuoteMode = mode.startsWith('quotes-');
  const isOrderMode = mode.startsWith('orders-');
  const isHomepageMode = homepageMode;
  const grep = categoryMode
    ? '@categories'
    : productMode
      ? '@products'
      : publicRegressionMode
        ? mode === 'catalogue'
          ? '@catalogue'
          : '@cart'
        : isHomepageMode
          ? mode === 'homepage-admin'
            ? '@homepage-admin'
            : mode === 'homepage-media'
              ? '@homepage-media'
              : mode === 'homepage-google-live'
                ? '@homepage-google-live'
                : mode === 'homepage-google-timeout'
                  ? '@homepage-google-timeout'
                  : mode === 'homepage-google-quota'
                    ? '@homepage-google-quota'
                    : mode === 'homepage-google-reviews'
                      ? '@homepage-google-live'
                      : mode === 'homepage-all'
                        ? '@homepage'
                        : '@homepage-public'
          : maintenanceMode
            ? mode === 'inspections'
              ? '@inspections'
              : mode === 'maintenance-all'
                ? '@maintenance|@inspections'
                : '@maintenance'
            : returnMode
              ? mode === 'returns-all'
                ? '@returns'
                : mode === 'returns-concurrency'
                  ? '@return-concurrency'
                  : mode === 'returns-issues'
                    ? '@return-issues'
                    : '@admin-returns'
              : fulfilmentMode
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
      ...(categoryMode || productMode || publicRegressionMode
        ? [
            categoryMode
              ? 'e2e/categories.spec.ts'
              : productMode
                ? 'e2e/products.spec.ts'
                : mode === 'catalogue'
                  ? 'e2e/catalogue.spec.ts'
                  : 'e2e/cart.spec.ts',
          ]
        : isHomepageMode
          ? ['e2e/homepage.spec.ts']
          : reservationMode || fulfilmentMode || returnMode
            ? ['e2e/orders.spec.ts']
            : maintenanceMode
              ? ['e2e/maintenance.spec.ts']
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
      ...(maintenanceMode
        ? ['--project=mobile-320', '--project=wide-1440']
        : []),
      ...(mode === 'homepage-all'
        ? [
            '--grep-invert',
            process.platform === 'win32'
              ? '"@homepage-google-(live|timeout|quota)"'
              : '@homepage-google-(live|timeout|quota)',
          ]
        : []),
      ...(mode === 'homepage-admin' ||
      mode === 'homepage-media' ||
      mode === 'homepage-all'
        ? ['--project=mobile-320', '--project=wide-1440']
        : mode === 'homepage-google-live'
          ? ['--project=mobile-320', '--project=wide-1440']
          : mode === 'homepage-google-timeout' ||
              mode === 'homepage-google-quota' ||
              mode === 'homepage-google-reviews'
            ? ['--project=wide-1440']
            : []),
    ],
    browserEnvironment,
  );
} finally {
  for (const server of servers) stopTree(server);
}
