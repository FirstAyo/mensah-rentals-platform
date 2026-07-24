import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import { beforeAll, describe, expect, it } from 'vitest';

import { InventoryService } from '../inventory/inventory.service';
import { PublicCartService } from './public-cart.service';

describe('public rental cart against PostgreSQL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const cart = new PublicCartService(
    new ConfigService<ApiEnvironment, true>({ PUBLIC_CART_TTL_DAYS: 30 }),
  );
  const inventory = new InventoryService();
  let actorId: string;
  let activeSlug: string;
  let inactiveSlug: string;
  let productId: string;
  let inventoryId: string;

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const actor = await prisma.user.create({
      data: {
        email: `cart-${suffix}@example.test`,
        firstName: 'Cart',
        lastName: 'Tester',
        passwordHash: 'not-used',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    actorId = actor.id;
    const category = await prisma.category.create({
      data: { name: `Cart ${suffix}`, slug: `cart-${suffix}` },
    });
    activeSlug = `active-${suffix}`;
    inactiveSlug = `inactive-${suffix}`;
    const active = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Active ${suffix}`,
        slug: activeSlug,
        shortDescription: 'A public cart integration product',
      },
    });
    productId = active.id;
    await prisma.product.create({
      data: {
        categoryId: category.id,
        isActive: false,
        name: `Inactive ${suffix}`,
        slug: inactiveSlug,
        shortDescription: 'Not publicly requestable',
      },
    });
    const createdInventory = await inventory.create(actorId, {
      initialQuantity: 2,
      initialState: 'RENTABLE',
      operationId: randomUUID(),
      productId,
      reason: 'Prove cart independence from internal capacity',
      trackingMode: 'BULK',
    });
    inventoryId = createdInventory.id;
  });

  it('creates lazily, stores only a token hash, and accepts desired quantity above internal capacity', async () => {
    expect(await cart.get()).toEqual({
      cart: { desiredUnitCount: 0, distinctItemCount: 0, items: [] },
    });
    const before = {
      inventory: await prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
      }),
      items: await prisma.inventoryItem.count({ where: { inventoryId } }),
      transactions: await prisma.inventoryTransaction.count({
        where: { inventoryId },
      }),
    };
    const result = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 100,
    });
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.cart.items[0]?.desiredQuantity).toBe(100);
    const stored = await prisma.cart.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(result.rawToken!) },
    });
    expect(stored.tokenHash).not.toBe(result.rawToken);
    expect(JSON.stringify(result.cart)).not.toMatch(
      /inventory|available|remaining|reserved|stock|token|price/i,
    );
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } }),
    ).toEqual(before.inventory);
    expect(await prisma.inventoryItem.count({ where: { inventoryId } })).toBe(
      before.items,
    );
    expect(
      await prisma.inventoryTransaction.count({ where: { inventoryId } }),
    ).toBe(before.transactions);
  });

  it('updates one composite-key line idempotently and isolates guest tokens', async () => {
    const first = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 3,
    });
    const updated = await cart.setItem(first.rawToken, activeSlug, {
      desiredQuantity: 7,
    });
    expect(updated.cart.distinctItemCount).toBe(1);
    expect(updated.cart.desiredUnitCount).toBe(7);
    const second = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 11,
    });
    expect((await cart.get(first.rawToken)).cart.desiredUnitCount).toBe(7);
    expect((await cart.get(second.rawToken)).cart.desiredUnitCount).toBe(11);
  });

  it('rejects new inactive products and retains deactivated customer intent as no longer listed', async () => {
    await expect(
      cart.setItem(undefined, inactiveSlug, { desiredQuantity: 1 }),
    ).rejects.toThrow(/not listed/);
    const current = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 4,
    });
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    const loaded = await cart.get(current.rawToken);
    expect(loaded.cart.items[0]?.product.requestable).toBe(false);
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: true },
    });
  });

  it('removes lines, clears only the owning cart, and rejects expired capabilities', async () => {
    const first = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 2,
    });
    const second = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 5,
    });
    expect(
      (await cart.removeItem(first.rawToken, activeSlug)).cart.items,
    ).toEqual([]);
    expect((await cart.get(second.rawToken)).cart.desiredUnitCount).toBe(5);
    expect((await cart.clear(second.rawToken)).clearToken).toBe(true);
    expect((await cart.get(second.rawToken)).cart.items).toEqual([]);

    const expired = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 1,
    });
    await prisma.cart.update({
      where: { tokenHash: hashSessionToken(expired.rawToken!) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await cart.get(expired.rawToken)).toEqual({
      cart: { desiredUnitCount: 0, distinctItemCount: 0, items: [] },
      clearToken: true,
    });
  });

  it('enforces positive desired quantities at the database boundary', async () => {
    const current = await cart.setItem(undefined, activeSlug, {
      desiredQuantity: 1,
    });
    const stored = await prisma.cart.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(current.rawToken!) },
    });
    await expect(
      prisma.cartItem.update({
        where: { cartId_productId: { cartId: stored.id, productId } },
        data: { desiredQuantity: 0 },
      }),
    ).rejects.toThrow();
  });
});
