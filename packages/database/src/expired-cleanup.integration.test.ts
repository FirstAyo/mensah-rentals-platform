import { createHash, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { cleanupExpiredData } from './expired-cleanup';
import { prisma } from './index';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('bounded expired-data cleanup against PostgreSQL', () => {
  afterAll(async () => prisma.$disconnect());

  it('removes only expired access data and preserves durable business history', async () => {
    const suffix = randomUUID().replaceAll('-', '');
    const expiredAt = new Date('2000-01-01T00:00:00.000Z');
    const cutoff = new Date('2000-01-02T00:00:00.000Z');
    const activeAt = new Date('2000-01-03T00:00:00.000Z');
    const actor = await prisma.user.create({
      data: {
        email: `test-cleanup-${suffix}@example.test`,
        firstName: 'Cleanup',
        lastName: 'Test',
        passwordHash: 'not-used',
        status: 'ACTIVE',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Test cleanup ${suffix}`, slug: `test-cleanup-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Test cleanup product ${suffix}`,
        slug: `test-cleanup-product-${suffix}`,
        shortDescription: 'Dedicated test database cleanup fixture',
      },
    });
    const inventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Test-only cleanup sentinel',
        initialState: 'RENTABLE',
        productId: product.id,
        trackingMode: 'BULK',
        transactions: {
          create: {
            actorUserId: actor.id,
            kind: 'INITIAL_STOCK',
            operationId: randomUUID(),
            quantity: 2,
            reason: 'Test-only append-only sentinel',
            toState: 'RENTABLE',
          },
        },
      },
    });
    const [expiredStaff, activeStaff] = await Promise.all([
      prisma.staffSession.create({
        data: {
          expiresAt: expiredAt,
          tokenHash: hash(`expired-staff-${suffix}`),
          userId: actor.id,
        },
      }),
      prisma.staffSession.create({
        data: {
          expiresAt: activeAt,
          tokenHash: hash(`active-staff-${suffix}`),
          userId: actor.id,
        },
      }),
    ]);
    const [expiredCart, activeCart] = await Promise.all([
      prisma.cart.create({
        data: {
          expiresAt: expiredAt,
          tokenHash: hash(`expired-cart-${suffix}`),
          items: {
            create: { desiredQuantity: 100, productId: product.id },
          },
        },
      }),
      prisma.cart.create({
        data: {
          expiresAt: activeAt,
          tokenHash: hash(`active-cart-${suffix}`),
          items: { create: { desiredQuantity: 1, productId: product.id } },
        },
      }),
    ]);
    const [expiredGuest, activeGuest] = await Promise.all([
      prisma.guestRequestSession.create({
        data: {
          expiresAt: expiredAt,
          tokenHash: hash(`expired-guest-${suffix}`),
        },
      }),
      prisma.guestRequestSession.create({
        data: {
          expiresAt: activeAt,
          tokenHash: hash(`active-guest-${suffix}`),
        },
      }),
    ]);
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.rentalRequest.create({
        data: {
          contactEmail: `guest-${suffix}@example.test`,
          contactFirstName: 'Ama',
          contactLastName: 'Mensah',
          contactPhone: '+233 20 123 4567',
          fulfillmentMethod: 'PICKUP',
          guestSessionId: expiredGuest.id,
          projectLocation: 'Accra',
          projectName: 'Cleanup preservation test',
          projectType: 'Test',
          referenceNumber: `MR-2000-${suffix.slice(0, 10).toUpperCase()}`,
          rentalEndDate: new Date('2030-01-03T00:00:00.000Z'),
          rentalStartDate: new Date('2030-01-01T00:00:00.000Z'),
          requestedTimeZone: 'Africa/Accra',
          sourceCartTokenHash: hash(`source-${suffix}`),
          submissionKeyHash: hash(`submission-${suffix}`),
          submissionPayloadHash: hash(`payload-${suffix}`),
          items: {
            create: {
              categoryName: category.name,
              categorySlug: category.slug,
              productId: product.id,
              productName: product.name,
              productSlug: product.slug,
              rentalUnit: 'each',
              requestedQuantity: 100,
            },
          },
        },
        include: { items: true },
      });
      const revision = await tx.rentalRequestRevision.create({
        data: {
          rentalRequestId: created.id,
          revisionNumber: 1,
          submittedByType: 'ORIGINAL_SUBMISSION',
          operationId: randomUUID(),
          payloadHash: hash(`revision-${suffix}`),
          contactFirstName: created.contactFirstName,
          contactLastName: created.contactLastName,
          contactEmail: created.contactEmail,
          contactPhone: created.contactPhone,
          companyName: created.companyName,
          projectName: created.projectName,
          projectType: created.projectType,
          projectLocation: created.projectLocation,
          fulfillmentMethod: created.fulfillmentMethod,
          deliveryAddress: created.deliveryAddress,
          rentalStartDate: created.rentalStartDate,
          rentalEndDate: created.rentalEndDate,
          requestedTimeZone: created.requestedTimeZone,
          customerNotes: created.customerNotes,
          items: {
            create: created.items.map((item, sortOrder) => ({
              productId: item.productId,
              productNameSnapshot: item.productName,
              productSlugSnapshot: item.productSlug,
              categoryNameSnapshot: item.categoryName,
              categorySlugSnapshot: item.categorySlug,
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
      return created;
    });

    const preview = await cleanupExpiredData(prisma, {
      batchSize: 1,
      cutoff,
      dryRun: true,
      maxBatches: 10,
    });
    expect(preview).toMatchObject({
      carts: 1,
      guestRequestSessions: 1,
      staffSessions: 1,
    });
    expect(
      await prisma.cart.findUnique({ where: { id: expiredCart.id } }),
    ).not.toBeNull();

    const cleaned = await cleanupExpiredData(prisma, {
      batchSize: 1,
      cutoff,
      maxBatches: 10,
    });
    expect(cleaned).toMatchObject({
      carts: 1,
      guestRequestSessions: 1,
      staffSessions: 1,
      truncated: false,
    });
    expect(
      await prisma.staffSession.findUnique({ where: { id: expiredStaff.id } }),
    ).toBeNull();
    expect(
      await prisma.staffSession.findUnique({ where: { id: activeStaff.id } }),
    ).not.toBeNull();
    expect(
      await prisma.cart.findUnique({ where: { id: expiredCart.id } }),
    ).toBeNull();
    expect(
      await prisma.cart.findUnique({ where: { id: activeCart.id } }),
    ).not.toBeNull();
    expect(
      await prisma.guestRequestSession.findUnique({
        where: { id: expiredGuest.id },
      }),
    ).toBeNull();
    expect(
      await prisma.guestRequestSession.findUnique({
        where: { id: activeGuest.id },
      }),
    ).not.toBeNull();

    const durable = await prisma.rentalRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { items: true },
    });
    expect(durable.guestSessionId).toBeNull();
    expect(durable.referenceNumber).toBe(request.referenceNumber);
    expect(durable.items).toEqual(request.items);
    expect(
      await prisma.inventory.findUnique({ where: { id: inventory.id } }),
    ).not.toBeNull();
    const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { inventoryId: inventory.id },
    });
    await expect(
      prisma.inventoryTransaction.update({
        where: { id: transaction.id },
        data: { reason: 'must remain immutable' },
      }),
    ).rejects.toThrow(/append-only/);

    expect(
      await cleanupExpiredData(prisma, {
        batchSize: 1,
        cutoff,
        maxBatches: 10,
      }),
    ).toMatchObject({
      carts: 0,
      guestRequestSessions: 0,
      staffSessions: 0,
    });
  }, 20_000);
});
