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
      toState: 'MAINTENANCE',
      quantity: 4,
      operationId,
      reason: 'Workshop inspection',
    });
    await service.moveBulk(actorId, created.id, {
      fromState: 'RENTABLE',
      toState: 'MAINTENANCE',
      quantity: 4,
      operationId,
      reason: 'Workshop inspection',
    });
    const quantities = await service.quantities(created.id);
    expect(quantities.states.RENTABLE).toBe(6);
    expect(quantities.states.MAINTENANCE).toBe(4);
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
        toState: 'MAINTENANCE',
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
    const transitioned = await service.transitionItem(
      actorId,
      created.id,
      item.id,
      {
        toState: 'MAINTENANCE',
        operationId: randomUUID(),
        reason: 'Service required',
      },
    );
    expect(transitioned.status).toBe('MAINTENANCE');
    expect((await service.quantities(created.id)).states.MAINTENANCE).toBe(1);
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
});
