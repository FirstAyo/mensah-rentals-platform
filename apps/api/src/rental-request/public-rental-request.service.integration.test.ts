import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type {
  ApiEnvironment,
  SubmitRentalRequestInput,
} from '@mensah-rentals/validation';
import { beforeAll, describe, expect, it } from 'vitest';

import { PublicCartService } from '../cart/public-cart.service';
import { InventoryService } from '../inventory/inventory.service';
import { PublicRentalRequestService } from './public-rental-request.service';

describe('guest rental requests against PostgreSQL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const config = new ConfigService<ApiEnvironment, true>({
    PUBLIC_CART_TTL_DAYS: 30,
    PUBLIC_REQUEST_TRACKING_SECRET: 'integration-test-request-secret',
    PUBLIC_REQUEST_TRACKING_TTL_DAYS: 180,
  });
  const carts = new PublicCartService(config);
  const requests = new PublicRentalRequestService(config);
  const inventory = new InventoryService();
  let actorId: string;
  let inventoryId: string;
  let productId: string;
  let productSlug: string;

  const payload = (): SubmitRentalRequestInput => ({
    submissionId: randomUUID(),
    companyName: null,
    contactEmail: `guest-${suffix}@example.test`,
    contactFirstName: 'Ama',
    contactLastName: 'Mensah',
    contactPhone: '+233 20 123 4567',
    customerNotes: null,
    deliveryAddress: null,
    fulfillmentMethod: 'PICKUP',
    projectLocation: 'Accra',
    projectName: 'Integration project',
    projectType: 'Event',
    rentalEndDate: '2026-08-03',
    rentalStartDate: '2026-08-01',
    requestedTimeZone: 'Africa/Accra',
  });

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const actor = await prisma.user.create({
      data: {
        email: `request-${suffix}@example.test`,
        firstName: 'Request',
        lastName: 'Tester',
        passwordHash: 'not-used',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    actorId = actor.id;
    const category = await prisma.category.create({
      data: { name: `Requests ${suffix}`, slug: `requests-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Chair ${suffix}`,
        slug: `chair-${suffix}`,
        shortDescription: 'Request test chair',
      },
    });
    productId = product.id;
    productSlug = product.slug;
    inventoryId = (
      await inventory.create(actorId, {
        initialQuantity: 2,
        initialState: 'RENTABLE',
        operationId: randomUUID(),
        productId,
        reason: 'Prove request submission does not reserve inventory',
        trackingMode: 'BULK',
      })
    ).id;
  });

  it('preserves desired quantity above capacity and changes no inventory data', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 100,
    });
    const input = payload();
    const before = {
      inventory: await prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
      }),
      items: await prisma.inventoryItem.count({ where: { inventoryId } }),
      transactions: await prisma.inventoryTransaction.count({
        where: { inventoryId },
      }),
    };
    const result = await requests.submit(cart.rawToken, undefined, input);
    expect(result.request.referenceNumber).toMatch(
      /^MR-\d{4}-[A-HJ-NP-Z2-9]{10}$/,
    );
    expect(result.request.items[0]?.requestedQuantity).toBe(100);
    expect(result.rawRequestToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result.request)).not.toMatch(
      /inventory|available|remaining|reserved|reservation|stock|price|contact|email|notes|token|staff/i,
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
    expect((await carts.get(cart.rawToken)).cart.items).toEqual([]);
  });

  it('replays the same submission idempotently and allows only the owning guest capability to track', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 3,
    });
    const input = payload();
    const first = await requests.submit(cart.rawToken, undefined, input);
    const replay = await requests.submit(cart.rawToken, undefined, input);
    expect(replay.request.referenceNumber).toBe(first.request.referenceNumber);
    expect(
      await prisma.rentalRequest.count({
        where: { referenceNumber: first.request.referenceNumber },
      }),
    ).toBe(1);
    await expect(
      requests.track('x'.repeat(43), first.request.referenceNumber),
    ).rejects.toThrow(/could not be found/i);
    expect(
      (
        await requests.track(
          first.rawRequestToken,
          first.request.referenceNumber,
        )
      ).request,
    ).toEqual(first.request);
    await expect(
      requests.track(undefined, first.request.referenceNumber),
    ).rejects.toThrow(/could not be found/i);
  });

  it('collapses concurrent identical submission attempts into one request', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 6,
    });
    const input = payload();
    const [first, second] = await Promise.all([
      requests.submit(cart.rawToken, undefined, input),
      requests.submit(cart.rawToken, undefined, input),
    ]);
    expect(second.request.referenceNumber).toBe(first.request.referenceNumber);
    expect(
      await prisma.rentalRequest.count({
        where: { referenceNumber: first.request.referenceNumber },
      }),
    ).toBe(1);
  });

  it('does not reactivate an expired guest tracking session through replay', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 5,
    });
    const input = payload();
    const submitted = await requests.submit(cart.rawToken, undefined, input);
    const stored = await prisma.rentalRequest.findUniqueOrThrow({
      where: { referenceNumber: submitted.request.referenceNumber },
      select: { guestSessionId: true },
    });
    const expiredAt = new Date(Date.now() - 1000);
    await prisma.guestRequestSession.update({
      where: { id: stored.guestSessionId },
      data: { expiresAt: expiredAt },
    });
    await expect(
      requests.submit(cart.rawToken, undefined, input),
    ).rejects.toThrow(/can no longer be replayed/i);
    expect(
      (
        await prisma.guestRequestSession.findUniqueOrThrow({
          where: { id: stored.guestSessionId },
        })
      ).expiresAt,
    ).toEqual(expiredAt);
  });

  it('rejects an inactive cart without consuming it', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 4,
    });
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    await expect(
      requests.submit(cart.rawToken, undefined, payload()),
    ).rejects.toThrow(/no longer listed/i);
    expect((await carts.get(cart.rawToken)).cart.items).toHaveLength(1);
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: true },
    });
  });

  it('enforces immutable submitted request items in PostgreSQL', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 2,
    });
    const submitted = await requests.submit(
      cart.rawToken,
      undefined,
      payload(),
    );
    const stored = await prisma.rentalRequest.findUniqueOrThrow({
      where: { referenceNumber: submitted.request.referenceNumber },
      include: { items: true },
    });
    await expect(
      prisma.rentalRequestItem.update({
        where: { id: stored.items[0]!.id },
        data: { requestedQuantity: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.rentalRequestItem.delete({ where: { id: stored.items[0]!.id } }),
    ).rejects.toThrow();
  });
});
