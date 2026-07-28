import { createHash, randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type { StaffUserResponse } from '@mensah-rentals/types';
import type {
  ApiEnvironment,
  QuoteRevisionInput,
} from '@mensah-rentals/validation';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { QuoteService } from '../quote/quote.service';
import { RentalRequestDecisionService } from '../rental-request/rental-request-decision.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';
import { RentalOrderService } from './rental-order.service';

describe('confirmed rental orders against PostgreSQL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const config = {
    get(key: keyof ApiEnvironment) {
      if (key === 'PUBLIC_QUOTE_ACCESS_SECRET')
        return 'test-only-quote-capability-secret-123456789';
      if (key === 'PUBLIC_QUOTE_ACCESS_TTL_DAYS') return 30;
      if (key === 'PUBLIC_ORDER_ACCESS_SECRET')
        return 'test-only-order-capability-secret-123456789';
      if (key === 'PUBLIC_ORDER_ACCESS_TTL_DAYS') return 30;
      if (key === 'WEB_ORIGIN') return 'http://localhost:3000';
      throw new Error(`Unexpected configuration ${key}`);
    },
  } as ConfigService<ApiEnvironment, true>;
  const quotes = new QuoteService(config);
  const orders = new RentalOrderService(config);
  const decisions = new RentalRequestDecisionService();
  let actor: StaffUserResponse;
  let productId: string;

  const hash = (value: string) =>
    createHash('sha256').update(`${suffix}:${value}`).digest('hex');
  const rawCapability = (link: string) => link.split('#capability=')[1]!;
  const fulfilled = <T>(
    result: PromiseSettledResult<T>,
  ): result is PromiseFulfilledResult<T> => result.status === 'fulfilled';

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });
    const user = await prisma.user.create({
      data: {
        email: `order-${suffix}@example.test`,
        firstName: 'Order',
        lastName: 'Tester',
        passwordHash: 'unused',
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
      status: 'ACTIVE',
      updatedAt: user.updatedAt.toISOString(),
    };
    const category = await prisma.category.create({
      data: { name: `Order ${suffix}`, slug: `order-${suffix}` },
    });
    productId = (
      await prisma.product.create({
        data: {
          categoryId: category.id,
          name: `Chair ${suffix}`,
          shortDescription: 'Order fixture',
          slug: `order-chair-${suffix}`,
        },
      })
    ).id;
  });

  async function approvedRequest(label: string) {
    const source = await prisma.rentalRequest.create({
      data: {
        companyName: 'Customer Company',
        contactEmail: `${label}-${suffix}@example.test`,
        contactFirstName: 'Customer',
        contactLastName: label,
        contactPhone: '+233 20 000 0000',
        customerNotes: 'Request customer note',
        fulfillmentMethod: 'PICKUP',
        projectLocation: 'Accra',
        projectName: `Project ${label}`,
        projectType: 'Event',
        referenceNumber: `MR-2026-${hash(label).slice(0, 10).toUpperCase()}`,
        rentalEndDate: new Date('2027-02-02T00:00:00Z'),
        rentalStartDate: new Date('2027-02-01T00:00:00Z'),
        requestedTimeZone: 'Africa/Accra',
        reviewStartedAt: new Date(),
        reviewVersion: 1,
        sourceCartTokenHash: hash(`${label}:cart`),
        status: 'UNDER_REVIEW',
        submissionKeyHash: hash(`${label}:submission`),
        submissionPayloadHash: hash(`${label}:payload`),
        items: {
          create: {
            categoryName: 'Furniture',
            categorySlug: 'furniture',
            productId,
            productName: 'Folding Chair',
            productSlug: 'folding-chair',
            rentalUnit: 'each',
            requestedQuantity: 10,
          },
        },
      },
      include: { items: true },
    });
    await decisions.approve(actor, source.id, {
      operationId: randomUUID(),
      expectedReviewVersion: 1,
      internalReason: 'Order fixture approval',
    });
    return source;
  }

  async function quoteInput(
    requestId: string,
    validUntil = '2027-01-31T12:00:00.000Z',
  ): Promise<QuoteRevisionInput> {
    const decision = await prisma.rentalRequestDecision.findUniqueOrThrow({
      where: { rentalRequestId: requestId },
      include: { items: true },
    });
    return {
      operationId: randomUUID(),
      items: decision.items.map((item) => ({
        rentalRequestDecisionItemId: item.id,
        quotedQuantity: item.approvedQuantity,
        unitPriceCents: 12550,
        taxable: true,
      })),
      charges: [
        {
          type: 'DELIVERY',
          label: 'Delivery',
          amountCents: 5000,
          taxable: true,
        },
      ],
      discountCents: 2500,
      discountTaxable: true,
      tax: { name: 'Test tax', rateBasisPoints: 500 },
      customerNotes: 'Customer-safe quote note',
      internalNotes: 'PRIVATE ORDER SENTINEL',
      terms: 'Order fixture terms',
      validUntil,
    };
  }

  async function acceptedQuote(label: string) {
    const source = await approvedRequest(label);
    const quote = await quotes.createFirst(
      actor,
      source.id,
      await quoteInput(source.id),
    );
    const revision = quote.revisions[0]!;
    const sent = await quotes.send(actor, quote.id, revision.id, {
      operationId: randomUUID(),
      expectedLifecycleVersion: 0,
    });
    await quotes.respond(rawCapability(sent.accessLink), {
      operationId: randomUUID(),
      response: 'ACCEPTED',
      note: 'Please proceed.',
    });
    return { quote, revision, source };
  }

  it('requires an explicit staff conversion and copies exact immutable customer and money snapshots', async () => {
    const { quote, revision, source } = await acceptedQuote('explicit');
    expect(
      await prisma.rentalOrder.count({ where: { quoteId: quote.id } }),
    ).toBe(0);
    const created = await orders.create(actor, quote.id, revision.id, {
      operationId: randomUUID(),
    });
    expect(created.order.orderNumber).toMatch(/^RO-[0-9A-F]{20}$/);
    const order = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: created.order.id },
      include: { charges: true, customerAccess: true, items: true, tax: true },
    });
    const accepted = await prisma.quoteRevision.findUniqueOrThrow({
      where: { id: revision.id },
      include: { charges: true, items: true, tax: true },
    });
    expect(order).toMatchObject({
      acceptedQuoteRevisionId: revision.id,
      acceptedRevisionNumber: revision.revisionNumber,
      chargeTotalCents: accepted.chargeTotalCents,
      companyNameSnapshot: source.companyName,
      contactEmailSnapshot: source.contactEmail,
      currency: 'CAD',
      discountCents: accepted.discountCents,
      itemSubtotalCents: accepted.itemSubtotalCents,
      projectNameSnapshot: source.projectName,
      reservationStatus: 'NOT_RESERVED',
      status: 'CONFIRMED',
      taxCents: accepted.taxCents,
      totalCents: accepted.totalCents,
    });
    expect(order.items).toHaveLength(accepted.items.length);
    expect(order.charges).toHaveLength(accepted.charges.length);
    expect(order.tax?.taxAmountCents).toBe(accepted.tax?.taxAmountCents);
    expect(order.customerAccess?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(order.customerAccess?.tokenHash).not.toContain(
      rawCapability(created.customerAccessLink),
    );
    await expect(
      prisma.rentalOrder.update({
        where: { id: order.id },
        data: { projectNameSnapshot: 'tampered' },
      }),
    ).rejects.toThrow('append-only');
    await expect(
      prisma.rentalOrderItem.update({
        where: { id: order.items[0]!.id },
        data: { quotedQuantity: 1 },
      }),
    ).rejects.toThrow('append-only');
  });

  it('rejects draft, sent, viewed, expired, rejected, and non-authoritative revisions', async () => {
    const draftSource = await approvedRequest('draft-ineligible');
    const draftQuote = await quotes.createFirst(
      actor,
      draftSource.id,
      await quoteInput(draftSource.id),
    );
    await expect(
      orders.create(actor, draftQuote.id, draftQuote.revisions[0]!.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('authoritative accepted');

    const sentSource = await approvedRequest('sent-ineligible');
    const sentQuote = await quotes.createFirst(
      actor,
      sentSource.id,
      await quoteInput(sentSource.id),
    );
    const sentRevision = sentQuote.revisions[0]!;
    const sentAccess = await quotes.send(actor, sentQuote.id, sentRevision.id, {
      operationId: randomUUID(),
      expectedLifecycleVersion: 0,
    });
    await expect(
      orders.create(actor, sentQuote.id, sentRevision.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('not eligible');
    await quotes.markViewed(rawCapability(sentAccess.accessLink));
    await expect(
      orders.create(actor, sentQuote.id, sentRevision.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('not eligible');

    const expiringSource = await approvedRequest('expired-ineligible');
    const validUntil = new Date(Date.now() + 3_000).toISOString();
    const expiringQuote = await quotes.createFirst(
      actor,
      expiringSource.id,
      await quoteInput(expiringSource.id, validUntil),
    );
    const expiringRevision = expiringQuote.revisions[0]!;
    const expiringAccess = await quotes.send(
      actor,
      expiringQuote.id,
      expiringRevision.id,
      {
        operationId: randomUUID(),
        expectedLifecycleVersion: 0,
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 3_100));
    await expect(
      quotes.respond(rawCapability(expiringAccess.accessLink), {
        operationId: randomUUID(),
        response: 'ACCEPTED',
        note: null,
      }),
    ).rejects.toThrow('no longer actionable');
    await expect(
      orders.create(actor, expiringQuote.id, expiringRevision.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('not eligible');

    const rejectedSource = await approvedRequest('rejected-ineligible');
    const rejectedQuote = await quotes.createFirst(
      actor,
      rejectedSource.id,
      await quoteInput(rejectedSource.id),
    );
    const rejectedRevision = rejectedQuote.revisions[0]!;
    const sent = await quotes.send(
      actor,
      rejectedQuote.id,
      rejectedRevision.id,
      {
        operationId: randomUUID(),
        expectedLifecycleVersion: 0,
      },
    );
    await quotes.respond(rawCapability(sent.accessLink), {
      operationId: randomUUID(),
      response: 'REJECTED',
      note: null,
    });
    await expect(
      orders.create(actor, rejectedQuote.id, rejectedRevision.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('not eligible');
    await expect(
      orders.create(actor, rejectedQuote.id, 'cm00000000000000000000000', {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('authoritative accepted');
  });

  it('replays the same operation, rejects changed reuse, and permits only one concurrent order', async () => {
    const { quote, revision } = await acceptedQuote('idempotency');
    const operationId = randomUUID();
    const first = await orders.create(actor, quote.id, revision.id, {
      operationId,
    });
    const replay = await orders.create(actor, quote.id, revision.id, {
      operationId,
    });
    expect(replay).toEqual(first);
    await expect(
      orders.create(actor, quote.id, 'cm00000000000000000000000', {
        operationId,
      }),
    ).rejects.toThrow('used differently');
    expect(
      await prisma.rentalOrder.count({ where: { quoteId: quote.id } }),
    ).toBe(1);

    const concurrent = await acceptedQuote('concurrent');
    const attempts = await Promise.allSettled([
      orders.create(actor, concurrent.quote.id, concurrent.revision.id, {
        operationId: randomUUID(),
      }),
      orders.create(actor, concurrent.quote.id, concurrent.revision.id, {
        operationId: randomUUID(),
      }),
    ]);
    expect(attempts.filter(fulfilled)).toHaveLength(1);
    expect(attempts.filter((result) => !fulfilled(result))).toHaveLength(1);
    expect(
      await prisma.rentalOrder.count({
        where: { quoteId: concurrent.quote.id },
      }),
    ).toBe(1);
  });

  it('retries an order-number collision with a fresh unique number', async () => {
    const occupied = await acceptedQuote('number-occupied');
    const first = await orders.create(
      actor,
      occupied.quote.id,
      occupied.revision.id,
      { operationId: randomUUID() },
    );
    const retryable = await acceptedQuote('number-retry');
    const retriedOrderNumber = `RO-${hash('number-collision-retry')
      .slice(0, 20)
      .toUpperCase()}`;
    const number = vi
      .spyOn(orders as unknown as { orderNumber: () => string }, 'orderNumber')
      .mockReturnValueOnce(first.order.orderNumber)
      .mockReturnValueOnce(retriedOrderNumber);
    try {
      const created = await orders.create(
        actor,
        retryable.quote.id,
        retryable.revision.id,
        { operationId: randomUUID() },
      );
      expect(created.order.orderNumber).toBe(retriedOrderNumber);
      expect(number).toHaveBeenCalledTimes(2);
    } finally {
      number.mockRestore();
    }
  });

  it('paginates, searches, and filters administrative order lists in PostgreSQL', async () => {
    for (const label of [`list-${suffix}-alpha`, `list-${suffix}-beta`]) {
      const accepted = await acceptedQuote(label);
      await orders.create(actor, accepted.quote.id, accepted.revision.id, {
        operationId: randomUUID(),
      });
    }
    const query = {
      fulfillmentMethod: 'PICKUP' as const,
      page: 1,
      pageSize: 1,
      reservationStatus: 'NOT_RESERVED' as const,
      search: `Project list-${suffix}-`,
      sortBy: 'confirmedAt' as const,
      sortDirection: 'asc' as const,
      status: 'CONFIRMED' as const,
    };
    const first = await orders.list(query);
    const second = await orders.list({ ...query, page: 2 });
    expect(first.meta).toMatchObject({ page: 1, total: 2, totalPages: 2 });
    expect(second.meta.page).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0]!.id).not.toBe(second.items[0]!.id);
    expect(
      first.items
        .concat(second.items)
        .every(
          (order) =>
            order.status === 'CONFIRMED' &&
            order.reservationStatus === 'NOT_RESERVED' &&
            order.fulfillmentMethod === 'PICKUP',
        ),
    ).toBe(true);
  });

  it('serves a confidential-safe public snapshot and records first view exactly once', async () => {
    const { quote, revision } = await acceptedQuote('customer-access');
    const created = await orders.create(actor, quote.id, revision.id, {
      operationId: randomUUID(),
    });
    const raw = rawCapability(created.customerAccessLink);
    const publicOrder = await orders.publicCurrent(raw);
    expectPublicDataSafe(publicOrder);
    expect(JSON.stringify(publicOrder)).not.toContain('PRIVATE ORDER SENTINEL');
    expect(publicOrder).toMatchObject({
      orderNumber: created.order.orderNumber,
      reservationStatus: 'NOT_RESERVED',
      status: 'CONFIRMED',
    });
    await Promise.all([orders.markViewed(raw), orders.markViewed(raw)]);
    expect(
      await prisma.rentalOrderActivity.count({
        where: { rentalOrderId: created.order.id, type: 'ORDER_VIEWED' },
      }),
    ).toBe(1);
  });

  it('uses a uniform unavailable response for invalid, expired, and revoked access', async () => {
    const invalidMessage = await orders
      .publicCurrent('invalid')
      .catch((error: Error) => error.message);
    const expired = await acceptedQuote('expired-access');
    const expiredOrders = new RentalOrderService({
      get(key: keyof ApiEnvironment) {
        if (key === 'PUBLIC_ORDER_ACCESS_SECRET')
          return 'test-only-order-capability-secret-123456789';
        if (key === 'PUBLIC_ORDER_ACCESS_TTL_DAYS') return -1;
        if (key === 'WEB_ORIGIN') return 'http://localhost:3000';
        throw new Error(`Unexpected configuration ${key}`);
      },
    } as ConfigService<ApiEnvironment, true>);
    const expiredOrder = await expiredOrders.create(
      actor,
      expired.quote.id,
      expired.revision.id,
      {
        operationId: randomUUID(),
      },
    );
    const expiredMessage = await orders
      .publicCurrent(rawCapability(expiredOrder.customerAccessLink))
      .catch((error: Error) => error.message);
    const revoked = await acceptedQuote('revoked-access');
    const revokedOrder = await orders.create(
      actor,
      revoked.quote.id,
      revoked.revision.id,
      {
        operationId: randomUUID(),
      },
    );
    await prisma.orderCustomerAccess.update({
      where: { rentalOrderId: revokedOrder.order.id },
      data: { revokedAt: new Date() },
    });
    const revokedMessage = await orders
      .publicCurrent(rawCapability(revokedOrder.customerAccessLink))
      .catch((error: Error) => error.message);
    expect([invalidMessage, expiredMessage, revokedMessage]).toEqual([
      'Order is unavailable',
      'Order is unavailable',
      'Order is unavailable',
    ]);
  });

  it('rechecks active status and live order.create permission inside conversion', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
    });
    const user = await prisma.user.create({
      data: {
        email: `stale-order-${suffix}@example.test`,
        firstName: 'Stale',
        lastName: 'Actor',
        passwordHash: 'unused',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    const staleActor = { ...actor, id: user.id, email: user.email };
    const disabled = await acceptedQuote('disabled-actor');
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'DISABLED' },
    });
    await expect(
      orders.create(staleActor, disabled.quote.id, disabled.revision.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('Insufficient permissions');
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE' },
    });
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
    });
    const revoked = await acceptedQuote('revoked-actor');
    await expect(
      orders.create(staleActor, revoked.quote.id, revoked.revision.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('Insufficient permissions');
  });

  it('does not create reservations or mutate inventory records or transactions', async () => {
    const sourceProduct = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const inventory = await prisma.inventory.create({
      data: {
        productId: sourceProduct.id,
        creationOperationId: randomUUID(),
        creationReason: 'Order non-reservation fixture',
        initialState: 'RENTABLE',
        trackingMode: 'BULK',
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        actorUserId: actor.id,
        inventoryId: inventory.id,
        kind: 'INITIAL_STOCK',
        operationId: randomUUID(),
        quantity: 25,
        reason: 'Order non-reservation fixture',
        toState: 'RENTABLE',
      },
    });
    const serializedProduct = await prisma.product.create({
      data: {
        categoryId: sourceProduct.categoryId,
        name: `Serialized order fixture ${suffix}`,
        shortDescription: 'Serialized non-reservation fixture',
        slug: `serialized-order-fixture-${suffix}`,
      },
    });
    const serialized = await prisma.inventory.create({
      data: {
        productId: serializedProduct.id,
        creationOperationId: randomUUID(),
        creationReason: 'Serialized order non-reservation fixture',
        initialState: 'RENTABLE',
        trackingMode: 'SERIALIZED',
      },
    });
    await prisma.inventoryItem.create({
      data: {
        assetNumber: `ORDER-${suffix.slice(0, 12).toUpperCase()}`,
        inventoryId: serialized.id,
        serialNumber: `SERIAL-${suffix.slice(0, 12).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    const inventoryIds = [inventory.id, serialized.id];
    const snapshot = () =>
      Promise.all([
        prisma.inventory.findMany({
          where: { id: { in: inventoryIds } },
          orderBy: { id: 'asc' },
        }),
        prisma.inventoryItem.findMany({
          where: { inventoryId: { in: inventoryIds } },
          orderBy: { id: 'asc' },
        }),
        prisma.inventoryTransaction.findMany({
          where: { inventoryId: { in: inventoryIds } },
          orderBy: { id: 'asc' },
        }),
      ]);
    const before = await snapshot();
    const accepted = await acceptedQuote('inventory-unchanged');
    await orders.create(actor, accepted.quote.id, accepted.revision.id, {
      operationId: randomUUID(),
    });
    expect(await snapshot()).toEqual(before);
    const reservationTable = await prisma.$queryRaw<
      Array<{ name: string | null }>
    >`
      SELECT to_regclass('public."Reservation"')::TEXT AS name
    `;
    expect(reservationTable[0]?.name).toBeNull();
  });
});
