import { createHash, randomUUID } from 'node:crypto';

import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type { StaffUserResponse } from '@mensah-rentals/types';
import { beforeAll, describe, expect, it } from 'vitest';

import { RentalRequestDecisionService } from './rental-request-decision.service';
import { InventoryService } from '../inventory/inventory.service';

describe('rental-request decisions against PostgreSQL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const service = new RentalRequestDecisionService();
  const inventoryService = new InventoryService();
  let actor: StaffUserResponse;
  let productIds: string[];
  let inventoryIds: string[];
  let inventoryBaseline: unknown;

  const digest = (value: string) =>
    createHash('sha256').update(`${suffix}:${value}`).digest('hex');

  async function request(label: string, quantities = [10, 4]) {
    return prisma.rentalRequest.create({
      data: {
        contactEmail: `${label}-${suffix}@example.test`,
        contactFirstName: 'Decision',
        contactLastName: 'Tester',
        contactPhone: '+233 20 000 0000',
        fulfillmentMethod: 'PICKUP',
        projectLocation: 'Accra',
        projectName: `Decision ${label}`,
        projectType: 'Event',
        referenceNumber: `MR-2026-${digest(label).slice(0, 10).toUpperCase()}`,
        rentalEndDate: new Date('2026-10-03T00:00:00.000Z'),
        rentalStartDate: new Date('2026-10-01T00:00:00.000Z'),
        requestedTimeZone: 'Africa/Accra',
        reviewStartedAt: new Date(),
        reviewVersion: 1,
        sourceCartTokenHash: digest(`${label}:cart`),
        status: 'UNDER_REVIEW',
        submissionKeyHash: digest(`${label}:submission`),
        submissionPayloadHash: digest(`${label}:payload`),
        items: {
          create: quantities.map((requestedQuantity, index) => ({
            categoryName: 'Decision fixtures',
            categorySlug: `decision-fixtures-${suffix}`,
            productId: productIds[index]!,
            productName: `Decision product ${index + 1}`,
            productSlug: `decision-product-${index + 1}-${suffix}`,
            rentalUnit: 'each',
            requestedQuantity,
          })),
        },
      },
      include: { items: { orderBy: { productName: 'asc' } } },
    });
  }

  async function inventorySnapshot() {
    return {
      inventories: await prisma.inventory.findMany({
        where: { id: { in: inventoryIds } },
        orderBy: { id: 'asc' },
      }),
      items: await prisma.inventoryItem.findMany({
        where: { inventoryId: { in: inventoryIds } },
        orderBy: { id: 'asc' },
      }),
      transactions: await prisma.inventoryTransaction.findMany({
        where: { inventoryId: { in: inventoryIds } },
        orderBy: { id: 'asc' },
      }),
    };
  }

  async function originalRequestSnapshot(rentalRequestId: string) {
    return prisma.rentalRequestItem.findMany({
      where: { rentalRequestId },
      orderBy: { productName: 'asc' },
      select: {
        categoryName: true,
        categorySlug: true,
        productName: true,
        productSlug: true,
        rentalUnit: true,
        requestedQuantity: true,
      },
    });
  }

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const requiredPermissions = await prisma.permission.findMany({
      where: {
        key: {
          in: [
            'rental_request.view',
            'rental_request.approve',
            'rental_request.partially_approve',
            'rental_request.reject',
            'inventory.view',
            'inventory.quantity.view',
            'inventory.adjust',
          ],
        },
      },
    });
    const role = await prisma.role.create({
      data: {
        displayName: `Decision reviewer ${suffix}`,
        name: `DECISION_REVIEWER_${suffix.toUpperCase()}`,
        permissions: {
          create: requiredPermissions.map(({ id }) => ({ permissionId: id })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
    const user = await prisma.user.create({
      data: {
        email: `decision-${suffix}@example.test`,
        firstName: 'Decision',
        lastName: 'Reviewer',
        passwordHash: 'not-used-by-this-test',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    actor = {
      createdAt: user.createdAt.toISOString(),
      email: user.email,
      firstName: user.firstName,
      id: user.id,
      lastLoginAt: null,
      lastName: user.lastName,
      permissionKeys: role.permissions.map(({ permission }) => permission.key),
      roles: [{ displayName: role.displayName, id: role.id, name: role.name }],
      status: user.status,
      updatedAt: user.updatedAt.toISOString(),
    };
    const persistedActor = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    const persistedKeys = persistedActor.roles.flatMap(({ role: assigned }) =>
      assigned.permissions.map(({ permission }) => permission.key),
    );
    if (persistedKeys.length !== 7)
      throw new Error(
        `Decision test permissions missing: ${persistedKeys.join(',')}`,
      );
    const category = await prisma.category.create({
      data: {
        name: `Decision fixtures ${suffix}`,
        slug: `decision-fixtures-${suffix}`,
      },
    });
    const products = await Promise.all(
      [1, 2].map((number) =>
        prisma.product.create({
          data: {
            categoryId: category.id,
            name: `Decision product ${number} ${suffix}`,
            shortDescription: 'Decision integration fixture',
            slug: `decision-product-${number}-${suffix}`,
          },
        }),
      ),
    );
    productIds = products.map(({ id }) => id);
    const inventories = await Promise.all([
      inventoryService.create(actor.id, {
        initialQuantity: 12,
        initialState: 'RENTABLE',
        operationId: randomUUID(),
        productId: productIds[0]!,
        reason: 'Decision non-reservation bulk fixture',
        trackingMode: 'BULK',
      }),
      inventoryService.create(actor.id, {
        initialQuantity: 2,
        initialState: 'RENTABLE',
        operationId: randomUUID(),
        productId: productIds[1]!,
        reason: 'Decision non-reservation serialized fixture',
        trackingMode: 'SERIALIZED',
      }),
    ]);
    inventoryIds = inventories.map(({ id }) => id);
    inventoryBaseline = await inventorySnapshot();
  });

  it('records a full approval once with immutable quantity snapshots and activity', async () => {
    const source = await request('approve');
    const beforeInventory = await inventorySnapshot();
    const beforeRequest = await originalRequestSnapshot(source.id);
    const operationId = randomUUID();
    const input = {
      customerExplanation: null,
      expectedReviewVersion: 1,
      internalReason: 'The request passed staff review.',
      operationId,
    };
    const first = await service.approve(actor, source.id, input);
    const replay = await service.approve(actor, source.id, input);
    expect(replay.id).toBe(first.id);
    expect(first.outcome).toBe('APPROVED');
    expect(first.quoteEligible).toBe(true);
    expect(first.items.map((item) => item.approvedQuantity)).toEqual([10, 4]);
    expect(await originalRequestSnapshot(source.id)).toEqual(beforeRequest);
    expect(await inventorySnapshot()).toEqual(beforeInventory);
    expect(
      await prisma.rentalRequestDecision.count({
        where: { rentalRequestId: source.id },
      }),
    ).toBe(1);
    expect(
      await prisma.rentalRequestActivity.count({
        where: { rentalRequestId: source.id, type: 'APPROVED' },
      }),
    ).toBe(1);
    await expect(
      prisma.rentalRequestDecision.update({
        where: { id: first.id },
        data: { internalReason: 'Attempted edit' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.rentalRequestDecisionItem.update({
        where: { rentalRequestItemId: source.items[0]!.id },
        data: { approvedQuantity: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.rentalRequest.update({
        where: { id: source.id },
        data: { reviewVersion: 3 },
      }),
    ).rejects.toThrow(/Terminal rental request review fields are immutable/i);
    await expect(
      service.approve(actor, source.id, {
        ...input,
        internalReason: 'Changed reuse of the same operation.',
      }),
    ).rejects.toThrow(/operation identifier/i);
  });

  it('records exact partial quantities while preserving the original request', async () => {
    const source = await request('partial');
    const beforeInventory = await inventorySnapshot();
    const beforeRequest = await originalRequestSnapshot(source.id);
    const decision = await service.partiallyApprove(actor, source.id, {
      customerExplanation: 'We can support part of your requested equipment.',
      expectedReviewVersion: 1,
      internalReason: 'Staff approved a reduced quantity after review.',
      items: [
        { approvedQuantity: 8, rentalRequestItemId: source.items[0]!.id },
        { approvedQuantity: 0, rentalRequestItemId: source.items[1]!.id },
      ],
      operationId: randomUUID(),
    });
    expect(decision.outcome).toBe('PARTIALLY_APPROVED');
    expect(decision.items.map((item) => item.approvedQuantity)).toEqual([8, 0]);
    expect(await originalRequestSnapshot(source.id)).toEqual(beforeRequest);
    expect(await inventorySnapshot()).toEqual(beforeInventory);
  });

  it('rejects with zero internal decision quantities but exposes no quote eligibility mutation', async () => {
    const source = await request('reject');
    const beforeInventory = await inventorySnapshot();
    const beforeRequest = await originalRequestSnapshot(source.id);
    const decision = await service.reject(actor, source.id, {
      customerExplanation: 'We are unable to support this request.',
      expectedReviewVersion: 1,
      internalReason: 'The request did not pass staff review.',
      operationId: randomUUID(),
    });
    expect(decision.quoteEligible).toBe(false);
    expect(decision.items.every((item) => item.approvedQuantity === 0)).toBe(
      true,
    );
    expect(await originalRequestSnapshot(source.id)).toEqual(beforeRequest);
    expect(await inventorySnapshot()).toEqual(beforeInventory);
  });

  it('rejects malformed partial decisions, stale versions, and second terminal decisions', async () => {
    const malformed = await request('malformed');
    await expect(
      service.partiallyApprove(actor, malformed.id, {
        customerExplanation: 'We can support part of your request.',
        expectedReviewVersion: 1,
        internalReason: 'A requested line was omitted.',
        items: [
          { approvedQuantity: 8, rentalRequestItemId: malformed.items[0]!.id },
        ],
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/every requested item exactly once/i);
    await expect(
      service.partiallyApprove(actor, malformed.id, {
        customerExplanation: 'We can support part of your request.',
        expectedReviewVersion: 1,
        internalReason: 'A requested line was duplicated.',
        items: [
          { approvedQuantity: 8, rentalRequestItemId: malformed.items[0]!.id },
          { approvedQuantity: 7, rentalRequestItemId: malformed.items[0]!.id },
        ],
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/every requested item exactly once/i);
    await expect(
      service.partiallyApprove(actor, malformed.id, {
        customerExplanation: 'We can support part of your request.',
        expectedReviewVersion: 1,
        internalReason: 'A documented partial decision.',
        items: [
          { approvedQuantity: 11, rentalRequestItemId: malformed.items[0]!.id },
          { approvedQuantity: 4, rentalRequestItemId: malformed.items[1]!.id },
        ],
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/cannot exceed/i);
    await expect(
      service.approve(actor, malformed.id, {
        expectedReviewVersion: 0,
        internalReason: 'Stale decision attempt.',
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/changed/i);
    await service.approve(actor, malformed.id, {
      expectedReviewVersion: 1,
      internalReason: 'Valid terminal decision.',
      operationId: randomUUID(),
    });
    await expect(
      service.reject(actor, malformed.id, {
        customerExplanation: 'We cannot support this request.',
        expectedReviewVersion: 2,
        internalReason: 'Second decision attempt.',
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/under review/i);
  });

  it('uses live permissions and blocks disabled actors', async () => {
    const source = await request('disabled');
    await prisma.user.update({
      where: { id: actor.id },
      data: { status: 'DISABLED' },
    });
    await expect(
      service.approve(actor, source.id, {
        expectedReviewVersion: 1,
        internalReason: 'Should never be accepted.',
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/permission/i);
    await prisma.user.update({
      where: { id: actor.id },
      data: { status: 'ACTIVE' },
    });
  });

  it('serializes competing terminal outcomes so exactly one decision wins', async () => {
    const sameOutcome = await request('concurrent-approve');
    const approvals = await Promise.allSettled([
      service.approve(actor, sameOutcome.id, {
        expectedReviewVersion: 1,
        internalReason: 'Concurrent approval A.',
        operationId: randomUUID(),
      }),
      service.approve(actor, sameOutcome.id, {
        expectedReviewVersion: 1,
        internalReason: 'Concurrent approval B.',
        operationId: randomUUID(),
      }),
    ]);
    expect(
      approvals.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      approvals.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);

    const competing = await request('concurrent-opposite');
    const outcomes = await Promise.allSettled([
      service.approve(actor, competing.id, {
        expectedReviewVersion: 1,
        internalReason: 'Concurrent approval.',
        operationId: randomUUID(),
      }),
      service.reject(actor, competing.id, {
        customerExplanation: 'We are unable to support this request.',
        expectedReviewVersion: 1,
        internalReason: 'Concurrent rejection.',
        operationId: randomUUID(),
      }),
    ]);
    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('leaves bulk balances, serialized assets, and inventory history unchanged', async () => {
    expect(await inventorySnapshot()).toEqual(inventoryBaseline);
  });

  it('keeps Phase 10 decisions separate from orders and reservations after quotes are introduced', async () => {
    const [tables] = await prisma.$queryRaw<
      Array<{
        order_table: string | null;
        quote_table: string | null;
        reservation_table: string | null;
      }>
    >`SELECT
      to_regclass('public."Quote"')::text AS quote_table,
      to_regclass('public."RentalOrder"')::text AS order_table,
      to_regclass('public."Reservation"')::text AS reservation_table`;
    expect(tables).toEqual({
      order_table: null,
      quote_table: '"Quote"',
      reservation_table: null,
    });
  });
});
