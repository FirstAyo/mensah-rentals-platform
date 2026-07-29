import { createHash, createHmac, randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type {
  AdminOrderAvailabilityResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import type {
  ApiEnvironment,
  QuoteRevisionInput,
} from '@mensah-rentals/validation';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { QuoteService } from '../quote/quote.service';
import { FulfilmentService } from '../fulfilment/fulfilment.service';
import { InventoryService } from '../inventory/inventory.service';
import { RentalRequestDecisionService } from '../rental-request/rental-request-decision.service';
import { RentalChangeRequestService } from '../rental-request/rental-change-request.service';
import { ReturnService } from '../returns/return.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';
import { InventoryReservationService } from './inventory-reservation.service';
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
  const reservations = new InventoryReservationService();
  const fulfilments = new FulfilmentService();
  const inventory = new InventoryService();
  const changes = new RentalChangeRequestService(config);
  const decisions = new RentalRequestDecisionService();
  const returns = new ReturnService();
  let actor: StaffUserResponse;
  let productId: string;
  let inventoryId: string;

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
    const source = await prisma.$transaction(async (tx) => {
      const created = await tx.rentalRequest.create({
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
      const revision = await tx.rentalRequestRevision.create({
        data: {
          rentalRequestId: created.id,
          revisionNumber: 1,
          submittedByType: 'ORIGINAL_SUBMISSION',
          operationId: randomUUID(),
          payloadHash: hash(`${label}:revision`),
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
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      await tx.rentalRequest.update({
        where: { id: created.id },
        data: { currentRevisionId: revision.id },
      });
      return { ...created, items: revision.items };
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
    const decision = await prisma.rentalRequestDecision.findFirstOrThrow({
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
      discountBaseCents: accepted.discountBaseCents,
      discountRateBasisPoints: accepted.discountRateBasisPoints,
      discountType: accepted.discountType,
      itemSubtotalCents: accepted.itemSubtotalCents,
      projectNameSnapshot: source.projectName,
      status: 'CONFIRMED',
      taxCents: accepted.taxCents,
      taxableDiscountCents: accepted.taxableDiscountCents,
      totalCents: accepted.totalCents,
    });
    expect(order.items).toHaveLength(accepted.items.length);
    expect(order.charges).toHaveLength(accepted.charges.length);
    expect(order.tax?.taxAmountCents).toBe(accepted.tax?.taxAmountCents);
    expect(order.customerAccess).toHaveLength(0);
    await expect(
      prisma.rentalOrder.update({
        where: { id: order.id },
        data: { projectNameSnapshot: 'tampered' },
      }),
    ).rejects.toThrow(/append-only|reservation status transition/);
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
  }, 15_000);

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

  it('serializes formal change submission against accepted-quote order conversion', async () => {
    const accepted = await acceptedQuote('change-order-race');
    const requestState = await prisma.rentalRequest.findUniqueOrThrow({
      where: { id: accepted.source.id },
      select: { currentRevisionId: true },
    });
    const currentRevision =
      await prisma.rentalRequestRevision.findUniqueOrThrow({
        where: { id: requestState.currentRevisionId! },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    const rawRequestCapability = createHmac('sha256', suffix)
      .update('change-order-race')
      .digest('base64url');
    await prisma.rentalRequestCustomerAccess.create({
      data: {
        rentalRequestId: accepted.source.id,
        tokenHash: hashSessionToken(rawRequestCapability),
        expiresAt: new Date('2027-03-01T00:00:00.000Z'),
      },
    });

    const [orderAttempt, changeAttempt] = await Promise.allSettled([
      orders.create(actor, accepted.quote.id, accepted.revision.id, {
        operationId: randomUUID(),
      }),
      changes.submit(rawRequestCapability, {
        companyName: currentRevision.companyName ?? undefined,
        contactEmail: currentRevision.contactEmail,
        contactFirstName: currentRevision.contactFirstName,
        contactLastName: currentRevision.contactLastName,
        contactPhone: currentRevision.contactPhone,
        customerNotes: currentRevision.customerNotes ?? undefined,
        deliveryAddress: currentRevision.deliveryAddress ?? undefined,
        expectedRevisionNumber: currentRevision.revisionNumber,
        fulfillmentMethod: currentRevision.fulfillmentMethod,
        items: currentRevision.items.map((item) => ({
          productId: item.productId!,
          requestedQuantity: item.requestedQuantity,
        })),
        operationId: randomUUID(),
        projectLocation: currentRevision.projectLocation,
        projectName: currentRevision.projectName,
        projectType: currentRevision.projectType,
        reason: 'Please change the accepted rental before confirmation.',
        rentalEndDate: currentRevision.rentalEndDate.toISOString().slice(0, 10),
        rentalStartDate: currentRevision.rentalStartDate
          .toISOString()
          .slice(0, 10),
        requestedTimeZone: currentRevision.requestedTimeZone,
      }),
    ]);

    expect(changeAttempt.status).toBe('fulfilled');
    const storedChange = await prisma.rentalChangeRequest.findFirstOrThrow({
      where: { rentalRequestId: accepted.source.id },
    });
    const storedOrder = await prisma.rentalOrder.findUnique({
      where: { rentalRequestId: accepted.source.id },
    });
    if (orderAttempt.status === 'fulfilled') {
      expect(storedOrder?.id).toBe(orderAttempt.value.order.id);
      expect(storedChange.rentalOrderId).toBe(storedOrder?.id);
    } else {
      expect(storedOrder).toBeNull();
      expect(String(orderAttempt.reason)).toContain(
        'pending formal change request',
      );
      expect(storedChange.rentalOrderId).toBeNull();
    }
    expect(
      await prisma.rentalOrder.count({
        where: { rentalRequestId: accepted.source.id },
      }),
    ).toBeLessThanOrEqual(1);
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
    const access = await orders.generateCustomerAccess(
      actor,
      created.order.id,
      {
        operationId: randomUUID(),
      },
    );
    const raw = rawCapability(access.accessLink!);
    await expect(
      orders.publicCurrent(created.order.orderNumber),
    ).rejects.toThrow('Order is unavailable');
    const publicOrder = await orders.publicCurrent(raw);
    expectPublicDataSafe(publicOrder);
    expect(JSON.stringify(publicOrder)).not.toContain('PRIVATE ORDER SENTINEL');
    expect(publicOrder).toMatchObject({
      orderNumber: created.order.orderNumber,
      status: 'CONFIRMED',
    });
    await Promise.all([orders.markViewed(raw), orders.markViewed(raw)]);
    expect(
      await prisma.rentalOrderActivity.count({
        where: { rentalOrderId: created.order.id, type: 'ORDER_VIEWED' },
      }),
    ).toBe(1);
  });

  it('generates, resends, rotates, and revokes one active access capability append-only', async () => {
    const { quote, revision } = await acceptedQuote('managed-access');
    const created = await orders.create(actor, quote.id, revision.id, {
      operationId: randomUUID(),
    });
    expect((await orders.detail(created.order.id)).customerAccess.state).toBe(
      'NONE',
    );
    const generateOperationId = randomUUID();
    const generated = await orders.generateCustomerAccess(
      actor,
      created.order.id,
      { operationId: generateOperationId },
    );
    expect(generated).toMatchObject({
      access: { state: 'ACTIVE' },
      deliveryMode: 'SECURE_TEST_LINK',
    });
    expect(
      await orders.generateCustomerAccess(actor, created.order.id, {
        operationId: generateOperationId,
      }),
    ).toEqual(generated);
    await expect(
      orders.generateCustomerAccess(actor, created.order.id, {
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('already has active');
    const beforeResendCount = await prisma.orderCustomerAccess.count({
      where: { rentalOrderId: created.order.id },
    });
    const resent = await orders.resendCustomerAccess(actor, created.order.id, {
      expectedAccessId: generated.access.accessId!,
      operationId: randomUUID(),
    });
    expect(resent.accessLink).toBe(generated.accessLink);
    expect(
      await prisma.orderCustomerAccess.count({
        where: { rentalOrderId: created.order.id },
      }),
    ).toBe(beforeResendCount);
    const rotated = await orders.rotateCustomerAccess(actor, created.order.id, {
      expectedAccessId: generated.access.accessId!,
      operationId: randomUUID(),
    });
    expect(rotated.access.accessId).not.toBe(generated.access.accessId);
    await expect(
      orders.publicCurrent(rawCapability(generated.accessLink!)),
    ).rejects.toThrow('Order is unavailable');
    await expect(
      orders.publicCurrent(rawCapability(rotated.accessLink!)),
    ).resolves.toMatchObject({ orderNumber: created.order.orderNumber });
    await orders.revokeCustomerAccess(actor, created.order.id, {
      expectedAccessId: rotated.access.accessId!,
      operationId: randomUUID(),
    });
    await expect(
      orders.publicCurrent(rawCapability(rotated.accessLink!)),
    ).rejects.toThrow('Order is unavailable');
    expect((await orders.detail(created.order.id)).customerAccess.state).toBe(
      'REVOKED',
    );
    expect(
      await prisma.orderCustomerAccess.count({
        where: { rentalOrderId: created.order.id },
      }),
    ).toBe(2);
  });

  it('copies percentage discount snapshots into the immutable order', async () => {
    const source = await approvedRequest('percentage-order');
    const input = await quoteInput(source.id);
    input.discountType = 'PERCENTAGE';
    input.discountRateBasisPoints = 1250;
    input.discountCents = 0;
    const quote = await quotes.createFirst(actor, source.id, input);
    const revision = quote.revisions[0]!;
    const sent = await quotes.send(actor, quote.id, revision.id, {
      expectedLifecycleVersion: 0,
      operationId: randomUUID(),
    });
    await quotes.respond(rawCapability(sent.accessLink), {
      operationId: randomUUID(),
      response: 'ACCEPTED',
      note: null,
    });
    const created = await orders.create(actor, quote.id, revision.id, {
      operationId: randomUUID(),
    });
    expect(
      await prisma.rentalOrder.findUniqueOrThrow({
        where: { id: created.order.id },
      }),
    ).toMatchObject({
      discountBaseCents: BigInt(revision.discountBaseCents),
      discountCents: BigInt(revision.discountCents),
      discountRateBasisPoints: 1250,
      discountType: 'PERCENTAGE',
      taxableDiscountCents: BigInt(revision.taxableDiscountCents),
    });
  });

  it('builds customer-safe selectable order PDFs for staff and capability access', async () => {
    const { quote, revision } = await acceptedQuote('order-pdf');
    const created = await orders.create(actor, quote.id, revision.id, {
      operationId: randomUUID(),
    });
    const access = await orders.generateCustomerAccess(
      actor,
      created.order.id,
      {
        operationId: randomUUID(),
      },
    );
    const staffPdf = await orders.staffPdf(created.order.id);
    const publicPdf = await orders.publicPdf(rawCapability(access.accessLink!));
    for (const pdf of [staffPdf, publicPdf]) {
      const text = pdf.buffer.toString('ascii');
      expect(text).toContain('%PDF-1.4');
      expect(text).toContain(created.order.orderNumber);
      expect(text).toContain('Status: CONFIRMED');
      expect(text).toContain('Rental dates: 2027-02-01 to 2027-02-02');
      expect(text).toContain('10 each x $125.50 = $1,255.00');
      expect(text).toContain('Delivery: $50.00');
      expect(text).toContain('Discount: $25.00');
      expect(text).toContain('Tax \\(Test tax 5.00%\\): $64.00');
      expect(text).toContain('Total: $1,344.00 CAD');
      expect(text).toContain('Order fixture terms');
      expect(text).toContain('Our team is arranging fulfilment');
      expect(text).not.toContain('PRIVATE ORDER SENTINEL');
      expect(text).not.toContain('tokenHash');
      expect(text).not.toContain('capability=');
      expect(text).not.toContain(actor.id);
    }
    await orders.revokeCustomerAccess(actor, created.order.id, {
      expectedAccessId: access.access.accessId!,
      operationId: randomUUID(),
    });
    await expect(
      orders.publicPdf(rawCapability(access.accessLink!)),
    ).rejects.toThrow('Order is unavailable');
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
    const expiredAccess = await expiredOrders.generateCustomerAccess(
      actor,
      expiredOrder.order.id,
      { operationId: randomUUID() },
    );
    const expiredRaw = `${expiredAccess.access.accessId}.${createHmac(
      'sha256',
      'test-only-order-capability-secret-123456789',
    )
      .update(`${expiredAccess.access.accessId}:${expiredOrder.order.id}`)
      .digest('base64url')}`;
    const expiredMessage = await orders
      .publicCurrent(expiredRaw)
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
    const revokedAccess = await orders.generateCustomerAccess(
      actor,
      revokedOrder.order.id,
      { operationId: randomUUID() },
    );
    await orders.revokeCustomerAccess(actor, revokedOrder.order.id, {
      expectedAccessId: revokedAccess.access.accessId!,
      operationId: randomUUID(),
    });
    const revokedMessage = await orders
      .publicCurrent(rawCapability(revokedAccess.accessLink!))
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

  it('rechecks active status and live view/update permissions for access operations', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
    });
    const user = await prisma.user.create({
      data: {
        email: `stale-access-${suffix}@example.test`,
        firstName: 'Access',
        lastName: 'Actor',
        passwordHash: 'unused',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    const staleActor = { ...actor, id: user.id, email: user.email };
    const accepted = await acceptedQuote('access-permission-recheck');
    const order = await orders.create(
      actor,
      accepted.quote.id,
      accepted.revision.id,
      { operationId: randomUUID() },
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'DISABLED' },
    });
    await expect(
      orders.generateCustomerAccess(staleActor, order.order.id, {
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
    await expect(
      orders.generateCustomerAccess(staleActor, order.order.id, {
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
    inventoryId = inventory.id;
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

  it('reserves bulk inventory transactionally, records shortfalls, completes, releases, and prevents concurrent overbooking', async () => {
    const initialTransactions = await prisma.inventoryTransaction.count({
      where: { inventoryId },
    });
    const makeOrder = async (label: string) => {
      const accepted = await acceptedQuote(label);
      const created = await orders.create(
        actor,
        accepted.quote.id,
        accepted.revision.id,
        {
          operationId: randomUUID(),
        },
      );
      return created.order.id;
    };

    const firstOrderId = await makeOrder('reserve-first');
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    let firstAvailability!: AdminOrderAvailabilityResponse;
    try {
      firstAvailability = await reservations.availability(
        actor.id,
        firstOrderId,
      );
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: true },
      });
    }
    expect(firstAvailability.items[0]).toMatchObject({
      availableToReserve: 25,
      orderedQuantity: 10,
      physicalRentableQuantity: 25,
      shortfallQuantity: 0,
    });
    const firstOperationId = randomUUID();
    const first = await reservations.create(actor.id, firstOrderId, {
      allowPartial: false,
      operationId: firstOperationId,
      serializedSelections: [],
    });
    expect(first).toMatchObject({ status: 'RESERVED', version: 1 });
    expect(first.items[0]).toMatchObject({
      requestedQuantity: 10,
      reservedQuantity: 10,
      shortfallQuantity: 0,
    });
    await expect(
      reservations.create(actor.id, firstOrderId, {
        allowPartial: false,
        operationId: firstOperationId,
        serializedSelections: [],
      }),
    ).resolves.toMatchObject({ id: first.id, version: 1 });

    const idempotentOrderId = await makeOrder('reserve-idempotent-race');
    const idempotentOperationId = randomUUID();
    const idempotentAttempts = await Promise.all([
      reservations.create(actor.id, idempotentOrderId, {
        allowPartial: false,
        operationId: idempotentOperationId,
        serializedSelections: [],
      }),
      reservations.create(actor.id, idempotentOrderId, {
        allowPartial: false,
        operationId: idempotentOperationId,
        serializedSelections: [],
      }),
    ]);
    expect(idempotentAttempts[0].id).toBe(idempotentAttempts[1].id);
    await reservations.release(
      actor.id,
      idempotentOrderId,
      idempotentAttempts[0].id,
      {
        expectedVersion: idempotentAttempts[0].version,
        operationId: randomUUID(),
        reason: 'Release idempotent-race fixture capacity.',
      },
    );

    const secondOrderId = await makeOrder('reserve-second');
    const second = await reservations.create(actor.id, secondOrderId, {
      allowPartial: false,
      operationId: randomUUID(),
      serializedSelections: [],
    });
    expect(second.status).toBe('RESERVED');

    const partialOrderId = await makeOrder('reserve-partial');
    const partial = await reservations.create(actor.id, partialOrderId, {
      allowPartial: true,
      operationId: randomUUID(),
      overrideReason: 'Five units will be sourced before fulfilment.',
      serializedSelections: [],
    });
    expect(partial).toMatchObject({
      overrideReason: 'Five units will be sourced before fulfilment.',
      status: 'PARTIALLY_RESERVED',
      version: 1,
    });
    expect(partial.items[0]).toMatchObject({
      reservedQuantity: 5,
      shortfallQuantity: 5,
    });

    const releasedFirst = await reservations.release(
      actor.id,
      firstOrderId,
      first.id,
      {
        expectedVersion: 1,
        operationId: randomUUID(),
        reason: 'Release for completion integration test.',
      },
    );
    expect(releasedFirst.status).toBe('RELEASED');
    const completed = await reservations.complete(
      actor.id,
      partialOrderId,
      partial.id,
      {
        allowPartial: false,
        expectedVersion: 1,
        operationId: randomUUID(),
        serializedSelections: [],
      },
    );
    expect(completed).toMatchObject({ status: 'RESERVED', version: 2 });
    expect(completed.items[0]).toMatchObject({
      reservedQuantity: 10,
      shortfallQuantity: 0,
    });
    await reservations.release(actor.id, secondOrderId, second.id, {
      expectedVersion: 1,
      operationId: randomUUID(),
      reason: 'Create room for concurrency test.',
    });

    const leftOrderId = await makeOrder('concurrent-left');
    const rightOrderId = await makeOrder('concurrent-right');
    const concurrent = await Promise.allSettled([
      reservations.create(actor.id, leftOrderId, {
        allowPartial: false,
        operationId: randomUUID(),
        serializedSelections: [],
      }),
      reservations.create(actor.id, rightOrderId, {
        allowPartial: false,
        operationId: randomUUID(),
        serializedSelections: [],
      }),
    ]);
    expect(concurrent.filter(fulfilled)).toHaveLength(1);
    expect(
      concurrent.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const failedOrderId =
      concurrent[0]!.status === 'rejected' ? leftOrderId : rightOrderId;
    const failedReservation =
      await prisma.inventoryReservation.findUniqueOrThrow({
        where: { rentalOrderId: failedOrderId },
      });
    expect(failedReservation).toMatchObject({
      status: 'RESERVATION_FAILED',
      version: 1,
    });
    await expect(
      reservations.release(actor.id, failedOrderId, failedReservation.id, {
        expectedVersion: 1,
        operationId: randomUUID(),
        reason: 'A failed attempt has nothing to release.',
      }),
    ).rejects.toThrow('no active inventory');
    expect(
      await prisma.inventoryTransaction.count({ where: { inventoryId } }),
    ).toBe(initialTransactions);

    const access = await orders.generateCustomerAccess(actor, firstOrderId, {
      operationId: randomUUID(),
    });
    const publicOrder = await orders.publicCurrent(
      rawCapability(access.accessLink!),
    );
    expectPublicDataSafe(publicOrder);
    expect(publicOrder).not.toHaveProperty('reservationStatus');
    expect(JSON.stringify(publicOrder)).not.toMatch(
      /reservedQuantity|shortfallQuantity|availableToReserve|assetNumber/,
    );
  }, 30_000);

  it('allocates one serialized asset to only one overlapping order and restores eligibility on release', async () => {
    const originalProductId = productId;
    const source = await prisma.product.findUniqueOrThrow({
      where: { id: originalProductId },
    });
    const serializedProduct = await prisma.product.create({
      data: {
        categoryId: source.categoryId,
        name: `Reservation camera ${suffix}`,
        shortDescription: 'Serialized reservation fixture',
        slug: `reservation-camera-${suffix}`,
      },
    });
    const serializedInventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Serialized reservation fixture',
        initialState: 'RENTABLE',
        productId: serializedProduct.id,
        trackingMode: 'SERIALIZED',
      },
    });
    const asset = await prisma.inventoryItem.create({
      data: {
        assetNumber: `RSV-ASSET-${suffix.slice(0, 10).toUpperCase()}`,
        inventoryId: serializedInventory.id,
        serialNumber: `RSV-SERIAL-${suffix.slice(0, 10).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    const secondAsset = await prisma.inventoryItem.create({
      data: {
        assetNumber: `RSV-ASSET-2-${suffix.slice(0, 10).toUpperCase()}`,
        inventoryId: serializedInventory.id,
        serialNumber: `RSV-SERIAL-2-${suffix.slice(0, 10).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    productId = serializedProduct.id;
    try {
      const makeSerializedOrder = async (label: string) => {
        const accepted = await acceptedQuote(label);
        return (
          await orders.create(actor, accepted.quote.id, accepted.revision.id, {
            operationId: randomUUID(),
          })
        ).order.id;
      };
      const leftOrderId = await makeSerializedOrder('serialized-left');
      const rightOrderId = await makeSerializedOrder('serialized-right');
      const leftOrder = await orders.detail(leftOrderId);
      const rightOrder = await orders.detail(rightOrderId);
      const attempts = await Promise.allSettled([
        reservations.create(actor.id, leftOrderId, {
          allowPartial: true,
          operationId: randomUUID(),
          overrideReason: 'Additional serialized assets will be sourced.',
          serializedSelections: [
            {
              rentalOrderItemId: leftOrder.items[0]!.id,
              serializedAssetIds: [asset.id],
            },
          ],
        }),
        reservations.create(actor.id, rightOrderId, {
          allowPartial: true,
          operationId: randomUUID(),
          overrideReason: 'Additional serialized assets will be sourced.',
          serializedSelections: [
            {
              rentalOrderItemId: rightOrder.items[0]!.id,
              serializedAssetIds: [asset.id],
            },
          ],
        }),
      ]);
      const winners = attempts.filter(fulfilled);
      expect(winners).toHaveLength(1);
      expect(
        attempts.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const winner = winners[0]!.value;
      expect(winner.items[0]).toMatchObject({
        reservedQuantity: 1,
        shortfallQuantity: 9,
      });
      expect(winner.items[0]!.allocations).toHaveLength(1);
      const winnerOrderId = winner.orderId;
      const expanded = await reservations.complete(
        actor.id,
        winnerOrderId,
        winner.id,
        {
          allowPartial: true,
          expectedVersion: 1,
          operationId: randomUUID(),
          overrideReason: 'Additional serialized assets remain outstanding.',
          serializedSelections: [
            {
              rentalOrderItemId: winner.items[0]!.rentalOrderItemId,
              serializedAssetIds: [secondAsset.id],
            },
          ],
        },
      );
      const firstAllocation = expanded.items[0]!.allocations.find(
        ({ serializedAssetId }) => serializedAssetId === asset.id,
      )!;
      const releaseOperationId = randomUUID();
      const releaseInput = {
        expectedVersion: 2,
        items: [
          {
            allocationIds: [firstAllocation.allocationId],
            rentalOrderItemId: winner.items[0]!.rentalOrderItemId,
          },
        ],
        operationId: releaseOperationId,
        reason: 'Release serialized concurrency fixture.',
      };
      const released = await reservations.release(
        actor.id,
        winnerOrderId,
        winner.id,
        releaseInput,
      );
      await expect(
        reservations.release(actor.id, winnerOrderId, winner.id, releaseInput),
      ).resolves.toMatchObject({ id: winner.id, version: released.version });
      await expect(
        reservations.release(actor.id, winnerOrderId, winner.id, {
          ...releaseInput,
          expectedVersion: released.version,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow('no longer active');
      const otherOrderId =
        winnerOrderId === leftOrderId ? rightOrderId : leftOrderId;
      const otherItemId =
        winnerOrderId === leftOrderId
          ? rightOrder.items[0]!.id
          : leftOrder.items[0]!.id;
      await expect(
        reservations.eligibleAssetsForOrder(
          actor.id,
          otherOrderId,
          otherItemId,
        ),
      ).resolves.toMatchObject({ items: [{ id: asset.id }] });
    } finally {
      productId = originalProductId;
    }
  }, 30_000);

  it('consumes bulk reservations exactly once without changing physical totals or exposing internal data', async () => {
    const originalProductId = productId;
    const source = await prisma.product.findUniqueOrThrow({
      where: { id: originalProductId },
    });
    const checkoutProduct = await prisma.product.create({
      data: {
        categoryId: source.categoryId,
        name: `Bulk checkout ${suffix}`,
        shortDescription: 'Bulk checkout fixture',
        slug: `bulk-checkout-${suffix}`,
      },
    });
    const checkoutInventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Bulk checkout fixture',
        initialState: 'RENTABLE',
        productId: checkoutProduct.id,
        trackingMode: 'BULK',
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        actorUserId: actor.id,
        inventoryId: checkoutInventory.id,
        kind: 'INITIAL_STOCK',
        operationId: randomUUID(),
        quantity: 2,
        reason: 'Bulk checkout fixture',
        toState: 'RENTABLE',
      },
    });
    productId = checkoutProduct.id;
    try {
      const accepted = await acceptedQuote('bulk-checkout');
      const orderId = (
        await orders.create(actor, accepted.quote.id, accepted.revision.id, {
          operationId: randomUUID(),
        })
      ).order.id;
      const order = await orders.detail(orderId);
      const reservation = await reservations.create(actor.id, orderId, {
        allowPartial: true,
        operationId: randomUUID(),
        overrideReason: 'Eight units remain commercially outstanding.',
        serializedSelections: [],
      });
      const started = await fulfilments.start(actor.id, orderId, {
        expectedReservationVersion: reservation.version,
        operationId: randomUUID(),
      });
      const prepared = await fulfilments.prepare(actor.id, orderId, {
        expectedVersion: started.version,
        items: [
          {
            quantity: 2,
            rentalOrderItemId: order.items[0]!.id,
            serializedAllocationIds: [],
          },
        ],
        operationId: randomUUID(),
      });
      const ready = await fulfilments.markReady(actor.id, orderId, {
        expectedVersion: prepared.version,
        operationId: randomUUID(),
      });
      const checkoutInput = {
        allowPartial: true as const,
        expectedReservationVersion: reservation.version,
        expectedVersion: ready.version,
        handoffAt: new Date().toISOString(),
        internalReason: 'Two reserved units handed to the customer.',
        items: [
          {
            quantity: 2,
            rentalOrderItemId: order.items[0]!.id,
            serializedAllocationIds: [],
          },
        ],
        operationId: randomUUID(),
        recipientName: 'Bulk Checkout Customer',
      };
      const before = await inventory.quantities(checkoutInventory.id);
      await expect(
        fulfilments.checkout(actor.id, orderId, {
          ...checkoutInput,
          operationId: randomUUID(),
          recipientName: undefined,
        }),
      ).rejects.toThrow(/recipient name/i);
      const checkoutRole = await prisma.role.create({
        data: {
          displayName: `Checkout verifier ${suffix}`,
          name: `CHECKOUT_${suffix.slice(0, 12).toUpperCase()}`,
        },
      });
      const checkoutPermissions = await prisma.permission.findMany({
        where: { key: { in: ['fulfilment.checkout', 'fulfilment.handoff'] } },
      });
      await prisma.rolePermission.createMany({
        data: checkoutPermissions.map((permission) => ({
          permissionId: permission.id,
          roleId: checkoutRole.id,
        })),
      });
      const checkoutVerifier = await prisma.user.create({
        data: {
          email: `checkout-verifier-${suffix}@example.test`,
          firstName: 'Checkout',
          lastName: 'Verifier',
          passwordHash: 'unused',
          status: 'DISABLED',
          roles: { create: { roleId: checkoutRole.id } },
        },
      });
      await expect(
        fulfilments.checkout(checkoutVerifier.id, orderId, {
          ...checkoutInput,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/permission|disabled|inactive/i);
      await prisma.user.update({
        where: { id: checkoutVerifier.id },
        data: { status: 'ACTIVE' },
      });
      const checkoutPermission = checkoutPermissions.find(
        ({ key }) => key === 'fulfilment.checkout',
      )!;
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            permissionId: checkoutPermission.id,
            roleId: checkoutRole.id,
          },
        },
      });
      await expect(
        fulfilments.checkout(checkoutVerifier.id, orderId, {
          ...checkoutInput,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/permission/i);
      const [checkedOut, replay] = await Promise.all([
        fulfilments.checkout(actor.id, orderId, checkoutInput),
        fulfilments.checkout(actor.id, orderId, checkoutInput),
      ]);
      expect(replay).toMatchObject({
        id: checkedOut.id,
        status: 'PARTIALLY_CHECKED_OUT',
        version: checkedOut.version,
      });
      const after = await inventory.quantities(checkoutInventory.id);
      expect(before).toMatchObject({
        states: { RENTABLE: 2, RENTED: 0 },
        totalQuantity: 2,
      });
      expect(after).toMatchObject({
        states: { RENTABLE: 0, RENTED: 2 },
        totalQuantity: 2,
      });
      expect(
        await prisma.inventoryTransaction.count({
          where: {
            fulfilmentOperationId: { not: null },
            inventoryId: checkoutInventory.id,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.inventoryReservationItem.findFirstOrThrow({
          where: { inventoryReservationId: reservation.id },
          select: { consumedQuantity: true, reservedQuantity: true },
        }),
      ).toEqual({ consumedQuantity: 2, reservedQuantity: 0 });
      expect(
        await prisma.activeRentalItem.findFirstOrThrow({
          where: { activeRental: { rentalOrderId: orderId } },
          select: { checkedOutQuantity: true },
        }),
      ).toEqual({ checkedOutQuantity: 2 });
      expect(
        await prisma.activeRental.findUniqueOrThrow({
          where: { rentalOrderId: orderId },
          select: { checkedOutAt: true },
        }),
      ).toEqual({ checkedOutAt: new Date(checkoutInput.handoffAt) });
      expect(
        await prisma.fulfilmentHandoff.count({
          where: { activeRental: { rentalOrderId: orderId } },
        }),
      ).toBe(1);
      const fulfilmentItem = await prisma.orderFulfilmentItem.findFirstOrThrow({
        where: { orderFulfilment: { rentalOrderId: orderId } },
      });
      const mismatchedOrderItem = await prisma.rentalOrderItem.findFirstOrThrow(
        {
          where: { rentalOrderId: { not: orderId } },
        },
      );
      await expect(
        prisma.orderFulfilmentItem.update({
          where: { id: fulfilmentItem.id },
          data: { rentalOrderItemId: mismatchedOrderItem.id },
        }),
      ).rejects.toThrow(
        /match its order and reservation item|unique constraint/i,
      );
      const preparationOperation =
        await prisma.fulfilmentOperation.findFirstOrThrow({
          where: {
            orderFulfilmentId: fulfilmentItem.orderFulfilmentId,
            type: 'PREPARATION_STARTED',
          },
        });
      const activeRental = await prisma.activeRental.findUniqueOrThrow({
        where: { rentalOrderId: orderId },
      });
      await expect(
        prisma.fulfilmentHandoff.create({
          data: {
            activeRentalId: activeRental.id,
            actorUserId: actor.id,
            fulfilmentOperationId: preparationOperation.id,
            handoffAt: new Date(),
            recipientName: 'Invalid cross-operation fixture',
            type: 'PICKUP',
          },
        }),
      ).rejects.toThrow(/handoff operation must be checkout/i);
      const access = await orders.generateCustomerAccess(actor, orderId, {
        operationId: randomUUID(),
      });
      const publicOrder = await orders.publicCurrent(
        rawCapability(access.accessLink!),
      );
      expectPublicDataSafe(publicOrder);
      expect(JSON.stringify(publicOrder)).not.toMatch(
        /reservedQuantity|preparedQuantity|shortfallQuantity|assetNumber|serialNumber|actorUserId/,
      );
      await prisma.inventoryTransaction.create({
        data: {
          actorUserId: actor.id,
          inventoryId: checkoutInventory.id,
          kind: 'INITIAL_STOCK',
          operationId: randomUUID(),
          quantity: 8,
          reason: 'Completion-checkout test stock',
          toState: 'RENTABLE',
        },
      });
      const currentReservation = await reservations.get(actor.id, orderId);
      const completedReservation = await reservations.complete(
        actor.id,
        orderId,
        reservation.id,
        {
          allowPartial: false,
          expectedVersion: currentReservation.version,
          operationId: randomUUID(),
          serializedSelections: [],
        },
      );
      expect(completedReservation).toMatchObject({
        status: 'PARTIALLY_CONSUMED',
        items: [
          {
            reservedQuantity: 8,
            shortfallQuantity: 0,
          },
        ],
      });
      const completionPrepared = await fulfilments.prepare(actor.id, orderId, {
        expectedVersion: checkedOut.version,
        items: [
          {
            quantity: 8,
            rentalOrderItemId: order.items[0]!.id,
            serializedAllocationIds: [],
          },
        ],
        operationId: randomUUID(),
      });
      const completionReady = await fulfilments.markReady(actor.id, orderId, {
        expectedVersion: completionPrepared.version,
        operationId: randomUUID(),
      });
      const completed = await fulfilments.checkout(actor.id, orderId, {
        allowPartial: false,
        expectedReservationVersion: completedReservation.version,
        expectedVersion: completionReady.version,
        handoffAt: new Date().toISOString(),
        items: [
          {
            quantity: 8,
            rentalOrderItemId: order.items[0]!.id,
            serializedAllocationIds: [],
          },
        ],
        operationId: randomUUID(),
        recipientName: 'Bulk Checkout Customer',
      });
      expect(completed).toMatchObject({ status: 'CHECKED_OUT' });
      expect(await inventory.quantities(checkoutInventory.id)).toMatchObject({
        states: { RENTABLE: 0, RENTED: 10 },
        totalQuantity: 10,
      });
      expect(
        await prisma.inventoryReservationItem.findFirstOrThrow({
          where: { inventoryReservationId: reservation.id },
          select: { consumedQuantity: true, reservedQuantity: true },
        }),
      ).toEqual({ consumedQuantity: 10, reservedQuantity: 0 });
      expect(
        await prisma.activeRental.findUniqueOrThrow({
          where: { rentalOrderId: orderId },
          select: { status: true },
        }),
      ).toEqual({ status: 'ACTIVE' });
      expect(
        await prisma.fulfilmentHandoff.count({
          where: { activeRental: { rentalOrderId: orderId } },
        }),
      ).toBe(2);

      const returnActiveRental = await prisma.activeRental.findUniqueOrThrow({
        where: { rentalOrderId: orderId },
        include: { items: true },
      });
      const returnItem = returnActiveRental.items[0]!;
      const firstReturnInput = {
        expectedVersion: 0,
        items: [
          {
            activeRentalItemId: returnItem.id,
            quantityDamaged: 0,
            quantityMaintenance: 0,
            quantityMissing: 0,
            quantityRentable: 4,
            serializedAssets: [],
          },
        ],
        operationId: randomUUID(),
        receivedAt: new Date().toISOString(),
      };
      await prisma.user.update({
        where: { id: actor.id },
        data: { status: 'DISABLED' },
      });
      await expect(
        returns.record(actor.id, returnActiveRental.id, firstReturnInput),
      ).rejects.toThrow(/disabled|inactive|permission/i);
      await prisma.user.update({
        where: { id: actor.id },
        data: { status: 'ACTIVE' },
      });
      const returnVerifierRole = await prisma.role.create({
        data: {
          displayName: `Return verifier ${suffix}`,
          name: `RETURN_${suffix.slice(0, 12).toUpperCase()}`,
        },
      });
      const returnPermissions = await prisma.permission.findMany({
        where: {
          key: { in: ['return.create', 'return.inspect', 'return.partial'] },
        },
      });
      await prisma.rolePermission.createMany({
        data: returnPermissions.map((permission) => ({
          permissionId: permission.id,
          roleId: returnVerifierRole.id,
        })),
      });
      const returnVerifier = await prisma.user.create({
        data: {
          email: `return-verifier-${suffix}@example.test`,
          firstName: 'Return',
          lastName: 'Verifier',
          passwordHash: 'unused',
          roles: { create: { roleId: returnVerifierRole.id } },
        },
      });
      const inspectPermission = returnPermissions.find(
        ({ key }) => key === 'return.inspect',
      )!;
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            permissionId: inspectPermission.id,
            roleId: returnVerifierRole.id,
          },
        },
      });
      await expect(
        returns.record(returnVerifier.id, returnActiveRental.id, {
          ...firstReturnInput,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/permission/i);
      const [firstReturn, firstReturnReplay] = await Promise.all([
        returns.record(actor.id, returnActiveRental.id, firstReturnInput),
        returns.record(actor.id, returnActiveRental.id, firstReturnInput),
      ]);
      expect(firstReturnReplay).toMatchObject({
        id: firstReturn.id,
        status: 'PARTIALLY_RETURNED',
        version: firstReturn.version,
      });
      await expect(
        returns.record(actor.id, returnActiveRental.id, {
          ...firstReturnInput,
          items: [
            {
              ...firstReturnInput.items[0]!,
              quantityRentable: 3,
            },
          ],
        }),
      ).rejects.toThrow(/operation id.*different/i);
      expect(await inventory.quantities(checkoutInventory.id)).toMatchObject({
        states: { RENTABLE: 4, RENTED: 6 },
        totalQuantity: 10,
      });
      await expect(
        returns.record(actor.id, returnActiveRental.id, {
          ...firstReturnInput,
          expectedVersion: firstReturn.version,
          items: [
            {
              ...firstReturnInput.items[0]!,
              quantityRentable: 7,
            },
          ],
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/exceeds.*outstanding/i);
      await expect(
        returns.record(actor.id, returnActiveRental.id, {
          ...firstReturnInput,
          expectedVersion: firstReturn.version,
          items: [
            {
              ...firstReturnInput.items[0]!,
              activeRentalItemId: `foreign-active-rental-item-${suffix}`,
              quantityRentable: 1,
            },
          ],
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/does not belong/i);

      const secondReturn = await returns.record(
        actor.id,
        returnActiveRental.id,
        {
          expectedVersion: firstReturn.version,
          items: [
            {
              activeRentalItemId: returnItem.id,
              quantityDamaged: 1,
              quantityMaintenance: 1,
              quantityMissing: 3,
              quantityRentable: 1,
              serializedAssets: [],
            },
          ],
          operationId: randomUUID(),
          receivedAt: new Date().toISOString(),
        },
      );
      expect(secondReturn).toMatchObject({
        status: 'RECONCILIATION_REQUIRED',
      });
      expect(await inventory.quantities(checkoutInventory.id)).toMatchObject({
        states: {
          DAMAGED: 1,
          MAINTENANCE: 1,
          MISSING: 3,
          RENTABLE: 5,
          RENTED: 0,
        },
        totalQuantity: 10,
      });
      await expect(
        returns.complete(actor.id, secondReturn.id, {
          expectedVersion: secondReturn.version,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/issue|reconcil|complete/i);

      const missingIssue = await prisma.rentalIssue.findFirstOrThrow({
        where: { rentalReturnId: secondReturn.id, type: 'MISSING' },
      });
      await expect(
        returns.resolveIssue(actor.id, missingIssue.id, {
          assessedCentsDelta: 0,
          expectedIssueVersion: missingIssue.version,
          expectedReturnVersion: secondReturn.version,
          internalReason: 'Invalid over-resolution must be rejected.',
          operationId: randomUUID(),
          outcome: 'WAIVED',
          paidCentsDelta: 0,
          quantity: 4,
        }),
      ).rejects.toThrow(/exceeds.*unresolved/i);
      await returns.resolveIssue(actor.id, missingIssue.id, {
        assessedCentsDelta: 0,
        expectedIssueVersion: missingIssue.version,
        expectedReturnVersion: secondReturn.version,
        internalReason: 'Business approved a waiver for the missing unit.',
        operationId: randomUUID(),
        outcome: 'WAIVED',
        paidCentsDelta: 0,
        quantity: 1,
      });
      expect(
        await prisma.rentalIssue.findUniqueOrThrow({
          where: { id: missingIssue.id },
          select: { openQuantity: true, status: true },
        }),
      ).toEqual({ openQuantity: 2, status: 'OPEN' });
      const partiallyResolvedIssue = await prisma.rentalIssue.findUniqueOrThrow(
        {
          where: { id: missingIssue.id },
        },
      );
      const partiallyResolvedReturn = await returns.detail(
        actor.id,
        secondReturn.id,
      );
      await returns.resolveIssue(actor.id, missingIssue.id, {
        assessedCentsDelta: 2_500,
        expectedIssueVersion: partiallyResolvedIssue.version,
        expectedReturnVersion: partiallyResolvedReturn.version,
        internalReason: 'Recorded an external payment without moving stock.',
        operationId: randomUUID(),
        outcome: 'PAID',
        paidCentsDelta: 2_500,
        quantity: 1,
      });
      const paidIssue = await prisma.rentalIssue.findUniqueOrThrow({
        where: { id: missingIssue.id },
      });
      const paidReturn = await returns.detail(actor.id, secondReturn.id);
      await returns.resolveIssue(actor.id, missingIssue.id, {
        assessedCentsDelta: 0,
        expectedIssueVersion: paidIssue.version,
        expectedReturnVersion: paidReturn.version,
        internalReason: 'Recovered remaining missing equipment.',
        operationId: randomUUID(),
        outcome: 'ITEM_RETURNED',
        paidCentsDelta: 0,
        quantity: 1,
        resultingInventoryState: 'RENTABLE',
      });
      expect(
        await prisma.rentalIssue.findUniqueOrThrow({
          where: { id: missingIssue.id },
          select: { openQuantity: true, status: true },
        }),
      ).toEqual({ openQuantity: 0, status: 'RESOLVED' });
      const damagedIssue = await prisma.rentalIssue.findFirstOrThrow({
        where: { rentalReturnId: secondReturn.id, type: 'DAMAGED' },
      });
      const damageReturn = await returns.detail(actor.id, secondReturn.id);
      await returns.resolveIssue(actor.id, damagedIssue.id, {
        assessedCentsDelta: 0,
        expectedIssueVersion: damagedIssue.version,
        expectedReturnVersion: damageReturn.version,
        internalReason: 'Repair completed and the unit passed inspection.',
        operationId: randomUUID(),
        outcome: 'REPAIRED',
        paidCentsDelta: 0,
        quantity: 1,
        resultingInventoryState: 'RENTABLE',
      });
      const maintenanceIssue = await prisma.rentalIssue.findFirstOrThrow({
        where: {
          rentalReturnId: secondReturn.id,
          type: 'MAINTENANCE_REQUIRED',
        },
      });
      const maintenanceReturn = await returns.detail(actor.id, secondReturn.id);
      await returns.resolveIssue(actor.id, maintenanceIssue.id, {
        assessedCentsDelta: 0,
        expectedIssueVersion: maintenanceIssue.version,
        expectedReturnVersion: maintenanceReturn.version,
        internalReason: 'Unit was formally retired after inspection.',
        operationId: randomUUID(),
        outcome: 'WRITTEN_OFF',
        paidCentsDelta: 0,
        quantity: 1,
        resultingInventoryState: 'RETIRED',
      });
      expect(
        await prisma.inventoryTransaction.count({
          where: {
            inventoryId: checkoutInventory.id,
            issueResolutionId: { not: null },
          },
        }),
      ).toBe(3);
      expect(await inventory.quantities(checkoutInventory.id)).toMatchObject({
        states: {
          DAMAGED: 0,
          MAINTENANCE: 0,
          MISSING: 2,
          RENTABLE: 7,
          RENTED: 0,
          RETIRED: 1,
        },
        totalQuantity: 10,
      });

      const afterResolution = await returns.detail(actor.id, secondReturn.id);
      const reconciled = await returns.reconcile(actor.id, secondReturn.id, {
        expectedVersion: afterResolution.version,
        operationId: randomUUID(),
      });
      const completedReturn = await returns.complete(
        actor.id,
        secondReturn.id,
        {
          expectedVersion: reconciled.version,
          operationId: randomUUID(),
        },
      );
      expect(completedReturn).toMatchObject({ status: 'COMPLETED' });
      expect(
        await prisma.activeRental.findUniqueOrThrow({
          where: { id: returnActiveRental.id },
          select: { status: true },
        }),
      ).toEqual({ status: 'COMPLETED' });
      await expect(
        returns.record(actor.id, returnActiveRental.id, {
          ...firstReturnInput,
          expectedVersion: completedReturn.version,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/cannot accept another return/i);
      const operation = await prisma.rentalReturnOperation.findFirstOrThrow({
        where: { rentalReturnId: completedReturn.id },
      });
      await expect(
        prisma.rentalReturnOperation.update({
          where: { id: operation.id },
          data: { internalNotes: 'Forbidden history edit' },
        }),
      ).rejects.toThrow(/append-only/i);
      for (const kind of [
        'receipt',
        'inspection',
        'missing',
        'damage',
        'reconciliation',
      ] as const) {
        const pdf = await returns.pdf(actor.id, completedReturn.id, kind);
        expect(pdf.filename).toMatch(/\.pdf$/);
        expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
        expect(pdf.buffer.length).toBeGreaterThan(500);
      }
    } finally {
      productId = originalProductId;
    }
  }, 60_000);

  it('checks out a serialized asset once and rejects a second checkout', async () => {
    const originalProductId = productId;
    const source = await prisma.product.findUniqueOrThrow({
      where: { id: originalProductId },
    });
    const checkoutProduct = await prisma.product.create({
      data: {
        categoryId: source.categoryId,
        name: `Serialized checkout ${suffix}`,
        shortDescription: 'Serialized checkout fixture',
        slug: `serialized-checkout-${suffix}`,
      },
    });
    const checkoutInventory = await prisma.inventory.create({
      data: {
        creationOperationId: randomUUID(),
        creationReason: 'Serialized checkout fixture',
        initialState: 'RENTABLE',
        productId: checkoutProduct.id,
        trackingMode: 'SERIALIZED',
      },
    });
    const asset = await prisma.inventoryItem.create({
      data: {
        assetNumber: `CHECKOUT-${suffix.slice(0, 12).toUpperCase()}`,
        inventoryId: checkoutInventory.id,
        serialNumber: `CHECKOUT-SERIAL-${suffix.slice(0, 12).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    const secondAsset = await prisma.inventoryItem.create({
      data: {
        assetNumber: `CHECKOUT-2-${suffix.slice(0, 12).toUpperCase()}`,
        inventoryId: checkoutInventory.id,
        serialNumber: `CHECKOUT-SERIAL-2-${suffix.slice(0, 12).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    const thirdAsset = await prisma.inventoryItem.create({
      data: {
        assetNumber: `CHECKOUT-3-${suffix.slice(0, 12).toUpperCase()}`,
        inventoryId: checkoutInventory.id,
        serialNumber: `CHECKOUT-SERIAL-3-${suffix.slice(0, 12).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    const fourthAsset = await prisma.inventoryItem.create({
      data: {
        assetNumber: `CHECKOUT-4-${suffix.slice(0, 12).toUpperCase()}`,
        inventoryId: checkoutInventory.id,
        serialNumber: `CHECKOUT-SERIAL-4-${suffix.slice(0, 12).toUpperCase()}`,
        status: 'RENTABLE',
      },
    });
    productId = checkoutProduct.id;
    try {
      const accepted = await acceptedQuote('serialized-checkout');
      const orderId = (
        await orders.create(actor, accepted.quote.id, accepted.revision.id, {
          operationId: randomUUID(),
        })
      ).order.id;
      const order = await orders.detail(orderId);
      const reservation = await reservations.create(actor.id, orderId, {
        allowPartial: true,
        operationId: randomUUID(),
        overrideReason: 'Six serialized units remain outstanding.',
        serializedSelections: [
          {
            rentalOrderItemId: order.items[0]!.id,
            serializedAssetIds: [
              asset.id,
              secondAsset.id,
              thirdAsset.id,
              fourthAsset.id,
            ],
          },
        ],
      });
      const allocationIds = reservation.items[0]!.allocations.map(
        ({ allocationId }) => allocationId,
      );
      expect(allocationIds).toHaveLength(4);
      const started = await fulfilments.start(actor.id, orderId, {
        expectedReservationVersion: reservation.version,
        operationId: randomUUID(),
      });
      const prepared = await fulfilments.prepare(actor.id, orderId, {
        expectedVersion: started.version,
        items: [
          {
            quantity: 4,
            rentalOrderItemId: order.items[0]!.id,
            serializedAllocationIds: allocationIds,
          },
        ],
        operationId: randomUUID(),
      });
      const ready = await fulfilments.markReady(actor.id, orderId, {
        expectedVersion: prepared.version,
        operationId: randomUUID(),
      });
      const preparedAssets = await prisma.preparedSerializedAsset.findMany({
        where: {
          orderFulfilmentItem: { rentalOrderItemId: order.items[0]!.id },
        },
        select: { serializedAllocationId: true },
      });
      expect(
        preparedAssets.map(
          ({ serializedAllocationId }) => serializedAllocationId,
        ),
      ).toEqual(expect.arrayContaining(allocationIds));
      await expect(
        prisma.preparedSerializedAsset.delete({
          where: { serializedAllocationId: allocationIds[0]! },
        }),
      ).rejects.toThrow(/count must match prepared quantity/i);
      const checkoutInput = {
        allowPartial: true as const,
        expectedReservationVersion: reservation.version,
        expectedVersion: ready.version,
        handoffAt: new Date().toISOString(),
        internalReason: 'Four reserved serialized assets handed over.',
        items: [
          {
            quantity: 4,
            rentalOrderItemId: order.items[0]!.id,
            serializedAllocationIds: allocationIds,
          },
        ],
        operationId: randomUUID(),
        recipientName: 'Serialized Checkout Customer',
      };
      const checkedOut = await fulfilments.checkout(
        actor.id,
        orderId,
        checkoutInput,
      );
      await expect(
        fulfilments.checkout(actor.id, orderId, checkoutInput),
      ).resolves.toMatchObject({
        id: checkedOut.id,
        version: checkedOut.version,
      });
      await expect(
        fulfilments.checkout(actor.id, orderId, {
          ...checkoutInput,
          expectedReservationVersion: reservation.version + 1,
          expectedVersion: checkedOut.version,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow(/prepared|reserved|eligible|actively reserved/i);
      expect(await inventory.quantities(checkoutInventory.id)).toMatchObject({
        states: { RENTABLE: 0, RENTED: 4 },
        totalQuantity: 4,
      });
      expect(
        await prisma.serializedAssetAllocation.count({
          where: { id: { in: allocationIds }, status: 'CONSUMED' },
        }),
      ).toBe(4);
      expect(
        await prisma.activeRentalSerializedAsset.count({
          where: { serializedAllocationId: { in: allocationIds } },
        }),
      ).toBe(4);
      expect(
        await prisma.preparedSerializedAsset.count({
          where: { serializedAllocationId: { in: allocationIds } },
        }),
      ).toBe(0);
      expect(
        await prisma.inventoryTransaction.count({
          where: {
            inventoryItemId: {
              in: [asset.id, secondAsset.id, thirdAsset.id, fourthAsset.id],
            },
            toState: 'RENTED',
          },
        }),
      ).toBe(4);

      const activeRental = await prisma.activeRental.findUniqueOrThrow({
        where: { rentalOrderId: orderId },
        include: { items: { include: { serializedAssets: true } } },
      });
      const activeItem = activeRental.items[0]!;
      expect(activeItem.serializedAssets).toHaveLength(4);
      const dispositions = [
        'RENTABLE',
        'RENTABLE',
        'DAMAGED',
        'MISSING',
      ] as const;
      const returned = await returns.record(actor.id, activeRental.id, {
        expectedVersion: 0,
        items: [
          {
            activeRentalItemId: activeItem.id,
            quantityDamaged: 1,
            quantityMaintenance: 0,
            quantityMissing: 1,
            quantityRentable: 2,
            serializedAssets: activeItem.serializedAssets.map(
              (occurrence, index) => ({
                activeRentalSerializedAssetId: occurrence.id,
                disposition: dispositions[index]!,
              }),
            ),
          },
        ],
        operationId: randomUUID(),
        receivedAt: new Date().toISOString(),
      });
      expect(returned).toMatchObject({ status: 'RECONCILIATION_REQUIRED' });
      expect(await inventory.quantities(checkoutInventory.id)).toMatchObject({
        states: { DAMAGED: 1, MISSING: 1, RENTABLE: 2, RENTED: 0 },
        totalQuantity: 4,
      });
      expect(
        await prisma.inventoryTransaction.count({
          where: {
            inventoryItemId: {
              in: [asset.id, secondAsset.id, thirdAsset.id, fourthAsset.id],
            },
            returnOperationItemId: { not: null },
          },
        }),
      ).toBe(4);
      await expect(
        returns.record(actor.id, activeRental.id, {
          expectedVersion: returned.version,
          items: [
            {
              activeRentalItemId: activeItem.id,
              quantityDamaged: 0,
              quantityMaintenance: 0,
              quantityMissing: 0,
              quantityRentable: 1,
              serializedAssets: [
                {
                  activeRentalSerializedAssetId:
                    activeItem.serializedAssets[0]!.id,
                  disposition: 'RENTABLE',
                },
              ],
            },
          ],
          operationId: randomUUID(),
          receivedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow(/outstanding|eligible|returned/i);

      for (const [type, outcome] of [
        ['MISSING', 'ITEM_RETURNED'],
        ['DAMAGED', 'REPAIRED'],
      ] as const) {
        const issue = await prisma.rentalIssue.findFirstOrThrow({
          where: { rentalReturnId: returned.id, type },
        });
        const currentReturn = await returns.detail(actor.id, returned.id);
        await returns.resolveIssue(actor.id, issue.id, {
          assessedCentsDelta: 0,
          expectedIssueVersion: issue.version,
          expectedReturnVersion: currentReturn.version,
          internalReason: `${type} serialized asset resolved in integration test.`,
          operationId: randomUUID(),
          outcome,
          paidCentsDelta: 0,
          quantity: 1,
          resultingInventoryState: 'RENTABLE',
        });
      }
      expect(await inventory.quantities(checkoutInventory.id)).toMatchObject({
        states: { DAMAGED: 0, MISSING: 0, RENTABLE: 4, RENTED: 0 },
        totalQuantity: 4,
      });
    } finally {
      productId = originalProductId;
    }
  }, 45_000);
});
