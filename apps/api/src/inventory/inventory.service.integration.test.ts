import { randomUUID } from 'node:crypto';

import { prisma, runRbacSeed } from '@mensah-rentals/database';
import { beforeAll, describe, expect, it } from 'vitest';

import { CatalogueRepository } from '../catalogue/catalogue.repository';
import { CatalogueService } from '../catalogue/catalogue.service';
import { InventoryService } from './inventory.service';

describe('inventory service against PostgreSQL', () => {
  const service = new InventoryService();
  const catalogue = new CatalogueService(new CatalogueRepository());
  const suffix = randomUUID().replaceAll('-', '');
  const productIds: string[] = [];
  const inventoryIds: string[] = [];
  let categoryId: string;
  let actorId: string;

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const actor = await prisma.user.create({
      data: {
        email: `inventory-${suffix}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Inventory',
        lastName: 'Operator',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    actorId = actor.id;
    const category = await prisma.category.create({
      data: { name: `Inventory ${suffix}`, slug: `inventory-${suffix}` },
    });
    categoryId = category.id;
  });

  async function product(label: string) {
    const value = await prisma.product.create({
      data: {
        categoryId,
        name: `${label} ${suffix}`,
        slug: `${label.toLowerCase().replaceAll(' ', '-')}-${suffix}`,
        shortDescription: 'Inventory integration test',
      },
    });
    productIds.push(value.id);
    return value;
  }

  it('creates bulk inventory, preserves append-only history, and applies idempotent movements', async () => {
    const currentProduct = await product('Bulk');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'BULK',
      initialQuantity: 10,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Initial stock count',
    });
    inventoryIds.push(created.id);
    const operationId = randomUUID();
    await service.moveBulk(actorId, created.id, {
      fromState: 'RENTABLE',
      toState: 'DAMAGED',
      quantity: 4,
      operationId,
      reason: 'Workshop inspection',
    });
    await service.moveBulk(actorId, created.id, {
      fromState: 'RENTABLE',
      toState: 'DAMAGED',
      quantity: 4,
      operationId,
      reason: 'Workshop inspection',
    });
    const quantities = await service.quantities(created.id);
    expect(quantities.states.RENTABLE).toBe(6);
    expect(quantities.states.DAMAGED).toBe(4);
    expect(
      await prisma.inventoryTransaction.count({
        where: { inventoryId: created.id },
      }),
    ).toBe(2);
    const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { inventoryId: created.id },
    });
    await expect(
      prisma.inventoryTransaction.update({
        where: { id: transaction.id },
        data: { reason: 'tamper' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.inventoryTransaction.delete({ where: { id: transaction.id } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      service.moveBulk(actorId, created.id, {
        fromState: 'RENTABLE',
        toState: 'DAMAGED',
        quantity: 7,
        operationId: randomUUID(),
        reason: 'Invalid excessive move',
      }),
    ).rejects.toThrow(/exceeds/);
  });

  it('returns one inventory for simultaneous identical creation retries', async () => {
    const currentProduct = await product('Idempotent create');
    const input = {
      productId: currentProduct.id,
      trackingMode: 'BULK' as const,
      initialQuantity: 3,
      initialState: 'RENTABLE' as const,
      operationId: randomUUID(),
      reason: 'Concurrent creation retry test',
    };
    const [first, second] = await Promise.all([
      service.create(actorId, input),
      service.create(actorId, input),
    ]);
    inventoryIds.push(first.id);
    expect(second.id).toBe(first.id);
    expect(
      await prisma.inventory.count({
        where: { creationOperationId: input.operationId },
      }),
    ).toBe(1);
  });

  it('serializes concurrent bulk changes so balances never become negative', async () => {
    const currentProduct = await product('Concurrent');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'BULK',
      initialQuantity: 6,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Initial stock',
    });
    inventoryIds.push(created.id);
    const results = await Promise.allSettled([
      service.moveBulk(actorId, created.id, {
        fromState: 'RENTABLE',
        toState: 'DAMAGED',
        quantity: 4,
        operationId: randomUUID(),
        reason: 'Concurrent A',
      }),
      service.moveBulk(actorId, created.id, {
        fromState: 'RENTABLE',
        toState: 'DAMAGED',
        quantity: 4,
        operationId: randomUUID(),
        reason: 'Concurrent B',
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const quantities = await service.quantities(created.id);
    expect(quantities.states.RENTABLE).toBe(2);
    expect(Object.values(quantities.states).every((value) => value >= 0)).toBe(
      true,
    );
  });

  it('tracks serialized assets atomically and rejects assets on bulk inventory', async () => {
    const currentProduct = await product('Serialized');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'SERIALIZED',
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Serialized setup',
    });
    inventoryIds.push(created.id);
    const item = await service.createItem(actorId, created.id, {
      assetNumber: `ASSET-${suffix.toUpperCase()}`,
      serialNumber: 'SERIAL-1',
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Asset received',
    });
    expect(item.assetNumber).toBe(`ASSET-${suffix.toUpperCase()}`);
    await expect(
      service.createItem(actorId, created.id, {
        assetNumber: item.assetNumber,
        serialNumber: 'DIFFERENT-SERIAL',
        initialState: 'RENTABLE',
        operationId: randomUUID(),
        reason: 'Duplicate asset number test',
      }),
    ).rejects.toThrow(/asset number already exists/i);
    const transitioned = await service.transitionItem(
      actorId,
      created.id,
      item.id,
      {
        toState: 'DAMAGED',
        operationId: randomUUID(),
        reason: 'Service required',
      },
    );
    expect(transitioned.status).toBe('DAMAGED');
    expect((await service.quantities(created.id)).states.DAMAGED).toBe(1);
    const bulkId = inventoryIds[0]!;
    await expect(
      prisma.inventoryItem.create({
        data: {
          inventoryId: bulkId,
          assetNumber: `INVALID-${suffix.toUpperCase()}`,
        },
      }),
    ).rejects.toThrow(/SERIALIZED/);
  });

  it('keeps public catalogue responses inventory-free after inventory exists', async () => {
    const page = await catalogue.listPublicProducts({
      page: 1,
      pageSize: 100,
      sortBy: 'name',
      sortDirection: 'asc',
    });
    const responseKeys: string[] = [];
    JSON.parse(JSON.stringify(page), (key, value) => {
      if (key) responseKeys.push(key);
      return value;
    });
    expect(responseKeys.join(' ')).not.toMatch(
      /inventory|assetNumber|serialNumber|totalQuantity|availableQuantity|stock|availability/i,
    );
    const inventoryId = inventoryIds[0]!;
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
    });
    await prisma.product.update({
      where: { id: inventory.productId },
      data: { isActive: false },
    });
    expect(
      await prisma.inventory.findUnique({ where: { id: inventoryId } }),
    ).not.toBeNull();
    expect(
      await prisma.inventoryTransaction.count({ where: { inventoryId } }),
    ).toBeGreaterThan(0);
  });

  it('adds and reduces owned bulk stock idempotently with immutable audit evidence', async () => {
    const currentProduct = await product('Owned stock');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'BULK',
      initialQuantity: 20,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Initial stock',
    });
    inventoryIds.push(created.id);
    const additionId = randomUUID();
    const addition = {
      operationId: additionId,
      quantity: 10,
      reason: 'Purchased ten additional units',
      reasonType: 'PURCHASE' as const,
      reference: 'SUPPLIER-100',
    };
    await service.addStock(actorId, created.id, addition);
    await service.addStock(actorId, created.id, addition);
    expect((await service.quantities(created.id)).totalQuantity).toBe(30);
    expect(
      await prisma.inventoryTransaction.count({
        where: { operationId: additionId, kind: 'STOCK_ADDITION' },
      }),
    ).toBe(1);
    expect(
      await prisma.platformAuditEvent.count({
        where: { sourceKey: `inventory-admin:${additionId}` },
      }),
    ).toBe(1);
    await expect(
      service.addStock(actorId, created.id, { ...addition, quantity: 11 }),
    ).rejects.toThrow(/already used differently/i);

    const reductionId = randomUUID();
    await service.reduceStock(actorId, created.id, {
      operationId: reductionId,
      quantity: 3,
      reason: 'Three units sold after fleet review',
      reasonType: 'SOLD',
      reference: null,
    });
    await service.reduceStock(actorId, created.id, {
      operationId: reductionId,
      quantity: 3,
      reason: 'Three units sold after fleet review',
      reasonType: 'SOLD',
      reference: null,
    });
    expect((await service.quantities(created.id)).totalQuantity).toBe(27);
    const reduction = await prisma.inventoryTransaction.findUniqueOrThrow({
      where: { operationId: reductionId },
    });
    expect(reduction).toMatchObject({
      fromState: 'RENTABLE',
      toState: null,
      quantity: 3,
      action: 'STOCK_REDUCED',
    });
    expect(
      await prisma.inventoryTransaction.count({
        where: { operationId: reductionId },
      }),
    ).toBe(1);
    await expect(
      service.reduceStock(actorId, created.id, {
        operationId: randomUUID(),
        quantity: 28,
        reason: 'Invalid excessive reduction',
        reasonType: 'INVENTORY_CORRECTION',
      }),
    ).rejects.toThrow(/exceeds uncommitted rentable stock/i);
  });

  it('serializes concurrent stock additions without losing either operation', async () => {
    const currentProduct = await product('Concurrent additions');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'BULK',
      initialQuantity: 20,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Initial stock',
    });
    inventoryIds.push(created.id);
    await Promise.all([
      service.addStock(actorId, created.id, {
        operationId: randomUUID(),
        quantity: 10,
        reason: 'Purchase batch A',
        reasonType: 'PURCHASE',
      }),
      service.addStock(actorId, created.id, {
        operationId: randomUUID(),
        quantity: 5,
        reason: 'Purchase batch B',
        reasonType: 'PURCHASE',
      }),
    ]);
    expect((await service.quantities(created.id)).totalQuantity).toBe(35);
  });

  it('serializes concurrent reductions so owned stock cannot be removed twice', async () => {
    const currentProduct = await product('Concurrent reductions');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'BULK',
      initialQuantity: 10,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Initial stock',
    });
    inventoryIds.push(created.id);
    const outcomes = await Promise.allSettled([
      service.reduceStock(actorId, created.id, {
        operationId: randomUUID(),
        quantity: 7,
        reason: 'Concurrent retirement operation A',
        reasonType: 'RETIRED',
      }),
      service.reduceStock(actorId, created.id, {
        operationId: randomUUID(),
        quantity: 7,
        reason: 'Concurrent retirement operation B',
        reasonType: 'RETIRED',
      }),
    ]);
    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await service.quantities(created.id)).totalQuantity).toBe(3);
  });

  it('blocks reduction for a live reservation but permits archive after consumed history', async () => {
    const currentProduct = await product('Reservation retirement safety');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'BULK',
      initialQuantity: 10,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Initial stock',
    });
    inventoryIds.push(created.id);
    const reservationId = randomUUID();
    const orderId = randomUUID();
    const orderItemId = randomUUID();
    const reservationItemId = randomUUID();
    await prisma.$transaction(async (tx) => {
      // Guarded-test-only orphan fixture isolates the reservation trigger without
      // fabricating the entire request/quote/order history owned by other phases.
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.$executeRaw`
        INSERT INTO "InventoryReservation" (
          "id", "rentalOrderId", "reservationNumber", "status",
          "rentalStartDateSnapshot", "rentalEndDateSnapshot", "rangeStartUtc",
          "rangeEndExclusiveUtc", "requestedTimeZoneSnapshot", "createdByUserId",
          "updatedAt"
        ) VALUES (
          ${reservationId}, ${orderId}, ${`IR-${suffix.slice(0, 20).toUpperCase()}`}, 'PARTIALLY_RESERVED',
          CURRENT_DATE, CURRENT_DATE + 1, now(), now() + interval '1 day',
          'America/Toronto', ${actorId}, now()
        )`;
      await tx.$executeRaw`
        INSERT INTO "InventoryReservationItem" (
          "id", "inventoryReservationId", "rentalOrderItemId", "inventoryId",
          "productIdSnapshot", "reservationType", "requestedQuantity",
          "reservedQuantity", "consumedQuantity", "shortfallQuantity", "updatedAt"
        ) VALUES (
          ${reservationItemId}, ${reservationId}, ${orderItemId}, ${created.id},
          ${currentProduct.id}, 'BULK', 5, 3, 0, 2, now()
        )`;
    });
    expect(
      (await service.quantities(created.id)).reservedCommitmentQuantity,
    ).toBe(3);
    await expect(
      service.reduceStock(actorId, created.id, {
        operationId: randomUUID(),
        quantity: 8,
        reason: 'Attempted reduction across a live reservation',
        reasonType: 'RETIRED',
      }),
    ).rejects.toThrow(/committed to an active reservation/i);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.$executeRaw`
        UPDATE "InventoryReservationItem"
        SET "reservedQuantity"=0, "consumedQuantity"=3
        WHERE "id"=${reservationItemId}`;
      await tx.$executeRaw`
        UPDATE "InventoryReservation" SET "status"='CONSUMED'
        WHERE "id"=${reservationId}`;
    });
    expect(
      (await service.quantities(created.id)).reservedCommitmentQuantity,
    ).toBe(0);
    await service.reduceStock(actorId, created.id, {
      operationId: randomUUID(),
      quantity: 10,
      reason: 'Retired only after the reservation was fully consumed',
      reasonType: 'RETIRED',
    });
    expect((await service.lifecycle(created.id)).canArchive).toBe(true);
    await service.archive(actorId, created.id, {
      operationId: randomUUID(),
      reason: 'No physical stock or live commitment remains',
    });
    expect((await service.get(created.id)).isActive).toBe(false);
  });

  it('updates metadata, archives historical zero-stock inventory, and restores it', async () => {
    const currentProduct = await product('Lifecycle');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'BULK',
      initialQuantity: 2,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Initial stock',
    });
    inventoryIds.push(created.id);
    const metadataOperationId = randomUUID();
    await service.updateMetadata(actorId, created.id, {
      operationId: metadataOperationId,
      internalNotes: 'Warehouse bay seven',
    });
    expect((await service.get(created.id)).internalNotes).toBe(
      'Warehouse bay seven',
    );
    const metadataAudit = await prisma.platformAuditEvent.findUniqueOrThrow({
      where: { sourceKey: `inventory-admin:${metadataOperationId}` },
    });
    expect(metadataAudit.action).toBe('INVENTORY_UPDATED');
    expect(metadataAudit.metadata).toMatchObject({
      beforeInternalNotes: null,
      afterInternalNotes: 'Warehouse bay seven',
    });
    await service.reduceStock(actorId, created.id, {
      operationId: randomUUID(),
      quantity: 2,
      reason: 'Units sold after retirement approval',
      reasonType: 'SOLD',
    });
    expect((await service.lifecycle(created.id)).canHardDelete).toBe(false);
    const archiveId = randomUUID();
    const archiveInput = {
      operationId: archiveId,
      reason: 'No longer carried',
    };
    await Promise.all([
      service.archive(actorId, created.id, archiveInput),
      service.archive(actorId, created.id, archiveInput),
    ]);
    expect((await service.get(created.id)).isActive).toBe(false);
    await expect(
      service.restore(actorId, created.id, archiveInput),
    ).rejects.toThrow(/already used differently/i);
    expect(
      await prisma.platformAuditEvent.count({
        where: { sourceKey: `inventory-admin:${archiveId}` },
      }),
    ).toBe(1);
    expect(
      (
        await service.list({
          page: 1,
          pageSize: 100,
          sortBy: 'productName',
          sortDirection: 'asc',
          lifecycle: 'ACTIVE',
        })
      ).items.some(({ id }) => id === created.id),
    ).toBe(false);
    await service.restore(actorId, created.id, {
      operationId: randomUUID(),
      reason: 'Returned to the managed catalogue',
    });
    expect((await service.get(created.id)).isActive).toBe(true);
  });

  it('hard deletes only a truly unused inventory aggregate and retains audit evidence', async () => {
    const currentProduct = await product('Unused serialized');
    const created = await service.create(actorId, {
      productId: currentProduct.id,
      trackingMode: 'SERIALIZED',
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      reason: 'Created by mistake',
    });
    const operationId = randomUUID();
    expect((await service.lifecycle(created.id)).canHardDelete).toBe(true);
    await service.delete(actorId, created.id, {
      operationId,
      reason: 'Duplicate unused setup',
    });
    await service.delete(actorId, created.id, {
      operationId,
      reason: 'Duplicate unused setup',
    });
    expect(
      await prisma.inventory.findUnique({ where: { id: created.id } }),
    ).toBeNull();
    expect(
      await prisma.platformAuditEvent.findUnique({
        where: { sourceKey: `inventory-admin:${operationId}` },
      }),
    ).not.toBeNull();
    await expect(
      service.delete(actorId, inventoryIds[0]!, {
        operationId: randomUUID(),
        reason: 'Must retain historical inventory',
      }),
    ).rejects.toThrow(/stock or history/i);
  });
});
