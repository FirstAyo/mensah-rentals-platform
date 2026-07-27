import { createHash, randomUUID } from 'node:crypto';

import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type { StaffUserResponse } from '@mensah-rentals/types';
import { beforeAll, describe, expect, it } from 'vitest';

import { InventoryService } from '../inventory/inventory.service';
import { AdminRentalRequestService } from './admin-rental-request.service';

describe('administrative rental-request review against PostgreSQL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const service = new AdminRentalRequestService();
  const inventory = new InventoryService();
  let actor: StaffUserResponse;
  let actorId: string;
  let assigneeId: string;
  let secondAssigneeId: string;
  let disabledAssigneeId: string;
  let productId: string;
  let inventoryId: string;

  const digest = (value: string) =>
    createHash('sha256').update(`${suffix}:${value}`).digest('hex');

  const staffResponse = (
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      status: 'ACTIVE' | 'DISABLED';
      createdAt: Date;
      updatedAt: Date;
    },
    permissionKeys: string[],
  ): StaffUserResponse => ({
    createdAt: user.createdAt.toISOString(),
    email: user.email,
    firstName: user.firstName,
    id: user.id,
    lastLoginAt: null,
    lastName: user.lastName,
    permissionKeys,
    roles: [{ displayName: 'Administrator', id: 'admin-role', name: 'ADMIN' }],
    status: user.status,
    updatedAt: user.updatedAt.toISOString(),
  });

  async function createRequest(
    label: string,
    quantity = 3,
    rentalStartDate = new Date('2026-09-01T00:00:00.000Z'),
  ) {
    return prisma.rentalRequest.create({
      data: {
        referenceNumber: `MR-2026-${digest(label).slice(0, 10).toUpperCase()}`,
        submissionKeyHash: digest(`${label}:submission`),
        submissionPayloadHash: digest(`${label}:payload`),
        sourceCartTokenHash: digest(`${label}:cart`),
        fulfillmentMethod: label.includes('delivery') ? 'DELIVERY' : 'PICKUP',
        contactFirstName: label.includes('search') ? 'Needle' : 'Ama',
        contactLastName: `Tester-${label}`,
        contactEmail: `${label}-${suffix}@example.test`,
        contactPhone: '+233 20 000 0000',
        projectName: `Project ${label}`,
        projectType: 'Event',
        projectLocation: 'Accra',
        deliveryAddress: label.includes('delivery') ? 'Accra Central' : null,
        rentalStartDate,
        rentalEndDate: new Date(
          rentalStartDate.getTime() + 2 * 24 * 60 * 60 * 1000,
        ),
        requestedTimeZone: 'Africa/Accra',
        items: {
          create: {
            productId,
            requestedQuantity: quantity,
            productName: `Snapshot chair ${label}`,
            productSlug: `snapshot-chair-${label}`,
            categoryName: 'Snapshot seating',
            categorySlug: 'snapshot-seating',
            rentalUnit: 'each',
          },
        },
      },
      include: { items: true },
    });
  }

  const listQuery = (overrides: Record<string, unknown> = {}) =>
    ({
      assignment: 'ALL',
      page: 1,
      pageSize: 20,
      sortBy: 'submittedAt',
      sortDirection: 'desc',
      ...overrides,
    }) as Parameters<AdminRentalRequestService['list']>[1];

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });
    const createStaff = (
      label: string,
      status: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
    ) =>
      prisma.user.create({
        data: {
          email: `${label}-${suffix}@example.test`,
          firstName: label,
          lastName: 'Reviewer',
          passwordHash: 'not-used-by-this-test',
          status,
          roles: { create: { roleId: adminRole.id } },
        },
      });
    const [actorUser, assignee, secondAssignee, disabledAssignee] =
      await Promise.all([
        createStaff('actor'),
        createStaff('assignee'),
        createStaff('second-assignee'),
        createStaff('disabled-assignee', 'DISABLED'),
      ]);
    actorId = actorUser.id;
    assigneeId = assignee.id;
    secondAssigneeId = secondAssignee.id;
    disabledAssigneeId = disabledAssignee.id;
    actor = staffResponse(
      actorUser,
      adminRole.permissions.map(({ permission }) => permission.key),
    );
    const category = await prisma.category.create({
      data: { name: `Review ${suffix}`, slug: `review-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Review chair ${suffix}`,
        slug: `review-chair-${suffix}`,
        shortDescription: 'Administrative review integration fixture',
      },
    });
    productId = product.id;
    inventoryId = (
      await inventory.create(actorId, {
        initialQuantity: 8,
        initialState: 'RENTABLE',
        operationId: randomUUID(),
        productId,
        reason: 'Administrative review test fixture',
        trackingMode: 'BULK',
      })
    ).id;
  });

  it('lists, searches, filters, and paginates server-side while preserving item snapshots', async () => {
    const first = await createRequest('search-pickup', 100);
    const second = await createRequest(
      'other-delivery',
      2,
      new Date('2026-09-10T00:00:00.000Z'),
    );
    await service.startReview(actor, first.id, {
      status: 'UNDER_REVIEW',
      expectedVersion: 0,
    });
    await service.assign(actor, second.id, {
      assigneeUserId: assigneeId,
      expectedVersion: 0,
    });
    const searched = await service.list(actor, listQuery({ search: 'Needle' }));
    expect(searched.items.map(({ id }) => id)).toContain(first.id);
    const filtered = await service.list(
      actor,
      listQuery({ fulfillmentMethod: 'DELIVERY', pageSize: 1 }),
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.meta.pageSize).toBe(1);
    expect(filtered.meta.total).toBeGreaterThanOrEqual(1);
    expect(
      (
        await service.list(actor, listQuery({ status: 'UNDER_REVIEW' }))
      ).items.map(({ id }) => id),
    ).toContain(first.id);
    expect(
      (
        await service.list(actor, listQuery({ assignment: 'ASSIGNED' }))
      ).items.map(({ id }) => id),
    ).toContain(second.id);
    const sorted = await service.list(
      actor,
      listQuery({ sortBy: 'rentalStartDate', sortDirection: 'asc' }),
    );
    expect(sorted.items.findIndex(({ id }) => id === first.id)).toBeLessThan(
      sorted.items.findIndex(({ id }) => id === second.id),
    );
    await prisma.product.update({
      where: { id: productId },
      data: { name: `Renamed live product ${suffix}` },
    });
    const detail = await service.detail(actor, first.id);
    expect(detail.items[0]).toMatchObject({
      productName: 'Snapshot chair search-pickup',
      requestedQuantity: 100,
    });
    await expect(
      service.detail(actor, 'cm00000000000000000000099'),
    ).rejects.toThrow(/not found/i);
  });

  it('serializes assignment, records history, rejects stale versions and disabled assignees', async () => {
    const current = await createRequest('assignment');
    const concurrent = await Promise.allSettled([
      service.assign(actor, current.id, {
        assigneeUserId: assigneeId,
        expectedVersion: 0,
      }),
      service.assign(actor, current.id, {
        assigneeUserId: secondAssigneeId,
        expectedVersion: 0,
      }),
    ]);
    expect(
      concurrent.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      concurrent.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    const assigned = await service.detail(actor, current.id);
    const winnerId = assigned.assignedTo!.id;
    const loserId = winnerId === assigneeId ? secondAssigneeId : assigneeId;
    await expect(
      service.assign(actor, current.id, {
        assigneeUserId: loserId,
        expectedVersion: 0,
      }),
    ).rejects.toThrow(/changed since it was loaded/i);
    const reassigned = await service.assign(actor, current.id, {
      assigneeUserId: loserId,
      expectedVersion: assigned.reviewVersion,
    });
    await expect(
      service.assign(actor, current.id, {
        assigneeUserId: disabledAssigneeId,
        expectedVersion: reassigned.reviewVersion,
      }),
    ).rejects.toThrow(/active staff member/i);
    const unassigned = await service.unassign(actor, current.id, {
      expectedVersion: reassigned.reviewVersion,
    });
    expect(unassigned.assignedTo).toBeNull();
    expect(
      (await service.activity(current.id)).map(({ type }) => type),
    ).toEqual(expect.arrayContaining(['ASSIGNED', 'REASSIGNED', 'UNASSIGNED']));
  });

  it('adds idempotent append-only notes and starts review exactly once', async () => {
    const current = await createRequest('review-note');
    const operationId = randomUUID();
    const first = await service.addNote(actor, current.id, {
      operationId,
      body: 'Customer confirmed project details.',
    });
    const replay = await service.addNote(actor, current.id, {
      operationId,
      body: 'Customer confirmed project details.',
    });
    expect(replay.id).toBe(first.id);
    expect(
      await prisma.rentalRequestInternalNote.count({
        where: { operationId },
      }),
    ).toBe(1);
    await expect(
      service.addNote(actor, current.id, {
        operationId,
        body: 'Changed content must conflict.',
      }),
    ).rejects.toThrow(/already used differently/i);
    await expect(
      prisma.rentalRequestInternalNote.update({
        where: { id: first.id },
        data: { body: 'Tamper attempt' },
      }),
    ).rejects.toThrow(/append-only/i);
    const concurrentReview = await Promise.allSettled([
      service.startReview(actor, current.id, {
        status: 'UNDER_REVIEW',
        expectedVersion: 0,
      }),
      service.startReview(actor, current.id, {
        status: 'UNDER_REVIEW',
        expectedVersion: 0,
      }),
    ]);
    expect(
      concurrentReview.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      concurrentReview.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    const reviewed = await service.detail(actor, current.id);
    expect(reviewed.status).toBe('UNDER_REVIEW');
    expect(reviewed.reviewStartedAt).not.toBeNull();
    expect(
      (await service.activity(current.id)).map(({ type }) => type),
    ).toEqual(expect.arrayContaining(['NOTE_ADDED', 'REVIEW_STARTED']));
  });

  it('gates inventory context and never mutates or reserves inventory during review', async () => {
    const current = await createRequest('inventory-context', 50);
    const before = {
      inventory: await prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
      }),
      transactions: await prisma.inventoryTransaction.count({
        where: { inventoryId },
      }),
      reservations: await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name ILIKE '%reservation%'
      `,
    };
    const withoutQuantityPermission = await service.detail(
      { ...actor, permissionKeys: ['rental_request.view', 'inventory.view'] },
      current.id,
    );
    expect(withoutQuantityPermission.items[0]).not.toHaveProperty(
      'inventoryContext',
    );
    const privileged = await service.detail(actor, current.id);
    expect(privileged.items[0]?.inventoryContext).toMatchObject({
      totalQuantity: 8,
      trackingMode: 'BULK',
    });
    expect(privileged.items[0]?.inventoryContext?.notice).toMatch(
      /No inventory is reserved/i,
    );
    await service.startReview(actor, current.id, {
      status: 'UNDER_REVIEW',
      expectedVersion: 0,
    });
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } }),
    ).toEqual(before.inventory);
    expect(
      await prisma.inventoryTransaction.count({ where: { inventoryId } }),
    ).toBe(before.transactions);
    expect(before.reservations[0]?.count).toBe(0n);
  });

  it('blocks a disabled actor even when a stale browser identity still carries permissions', async () => {
    const current = await createRequest('disabled-actor');
    await prisma.user.update({
      where: { id: actorId },
      data: { status: 'DISABLED' },
    });
    await expect(
      service.startReview(actor, current.id, {
        status: 'UNDER_REVIEW',
        expectedVersion: 0,
      }),
    ).rejects.toThrow(/insufficient permissions/i);
    await prisma.user.update({
      where: { id: actorId },
      data: { status: 'ACTIVE' },
    });
  });
});
