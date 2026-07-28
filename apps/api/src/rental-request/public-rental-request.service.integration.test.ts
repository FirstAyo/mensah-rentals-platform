import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type { StaffUserResponse } from '@mensah-rentals/types';
import type {
  ApiEnvironment,
  QuoteRevisionInput,
  SubmitRentalRequestAmendmentInput,
  SubmitRentalRequestInput,
} from '@mensah-rentals/validation';
import { beforeAll, describe, expect, it } from 'vitest';

import { PublicCartService } from '../cart/public-cart.service';
import { InventoryService } from '../inventory/inventory.service';
import { QuoteService } from '../quote/quote.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';
import { PublicRentalRequestService } from './public-rental-request.service';
import { RentalChangeRequestService } from './rental-change-request.service';
import { RentalRequestDecisionService } from './rental-request-decision.service';
import { RentalRequestRevisionService } from './rental-request-revision.service';

describe('guest rental requests against PostgreSQL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const config = new ConfigService<ApiEnvironment, true>({
    PUBLIC_CART_TTL_DAYS: 30,
    PUBLIC_REQUEST_TRACKING_SECRET: 'integration-test-request-secret',
    PUBLIC_REQUEST_TRACKING_TTL_DAYS: 180,
    PUBLIC_QUOTE_ACCESS_SECRET: 'integration-test-quote-secret-123456789',
    PUBLIC_QUOTE_ACCESS_TTL_DAYS: 30,
    WEB_ORIGIN: 'http://localhost:3000',
  });
  const carts = new PublicCartService(config);
  const requests = new PublicRentalRequestService(config);
  const revisions = new RentalRequestRevisionService();
  const inventory = new InventoryService();
  const decisions = new RentalRequestDecisionService();
  const quotes = new QuoteService(config);
  const changes = new RentalChangeRequestService(config);
  let actor: StaffUserResponse;
  let actorId: string;
  let inventoryId: string;
  let productId: string;
  let productSlug: string;
  let secondProductSlug: string;
  let thirdProductId: string;
  let inactiveProductId: string;

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
  const revisionFields = (): Omit<SubmitRentalRequestInput, 'submissionId'> =>
    Object.fromEntries(
      Object.entries(payload()).filter(([key]) => key !== 'submissionId'),
    ) as Omit<SubmitRentalRequestInput, 'submissionId'>;

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });
    const actorRecord = await prisma.user.create({
      data: {
        email: `request-${suffix}@example.test`,
        firstName: 'Request',
        lastName: 'Tester',
        passwordHash: 'not-used',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    actorId = actorRecord.id;
    actor = {
      createdAt: actorRecord.createdAt.toISOString(),
      email: actorRecord.email,
      firstName: actorRecord.firstName,
      id: actorRecord.id,
      lastLoginAt: null,
      lastName: actorRecord.lastName,
      permissionKeys: role.permissions.map(({ permission }) => permission.key),
      roles: [{ displayName: role.displayName, id: role.id, name: role.name }],
      status: 'ACTIVE',
      updatedAt: actorRecord.updatedAt.toISOString(),
    };
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
    const [secondProduct, thirdProduct, inactiveProduct] = await Promise.all([
      prisma.product.create({
        data: {
          categoryId: category.id,
          name: `Table ${suffix}`,
          slug: `table-${suffix}`,
          shortDescription: 'Second amendment fixture',
        },
      }),
      prisma.product.create({
        data: {
          categoryId: category.id,
          name: `Tent ${suffix}`,
          slug: `tent-${suffix}`,
          shortDescription: 'Added amendment fixture',
        },
      }),
      prisma.product.create({
        data: {
          categoryId: category.id,
          isActive: false,
          name: `Archived ${suffix}`,
          slug: `archived-${suffix}`,
          shortDescription: 'Inactive amendment fixture',
        },
      }),
    ]);
    secondProductSlug = secondProduct.slug;
    thirdProductId = thirdProduct.id;
    inactiveProductId = inactiveProduct.id;
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
    expectPublicDataSafe(result.request);
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

  it('returns only customer-safe partial-decision fields when tracked', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 5,
    });
    const submitted = await requests.submit(
      cart.rawToken,
      undefined,
      payload(),
    );
    const stored = await prisma.rentalRequest.findUniqueOrThrow({
      where: { referenceNumber: submitted.request.referenceNumber },
      include: { currentRevision: { include: { items: true } }, items: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.rentalRequest.update({
        where: { id: stored.id },
        data: {
          reviewStartedAt: new Date(),
          reviewVersion: 1,
          status: 'UNDER_REVIEW',
        },
      });
      const decision = await tx.rentalRequestDecision.create({
        data: {
          customerExplanation: 'Only 12 units are available in inventory.',
          decidedByUserId: actorId,
          internalReason: 'PRIVATE-INTERNAL-DECISION-SENTINEL',
          operationId: randomUUID(),
          outcome: 'PARTIALLY_APPROVED',
          payloadHash: 'a'.repeat(64),
          rentalRequestId: stored.id,
          rentalRequestRevisionId: stored.currentRevision!.id,
          reviewVersionAfter: 2,
          reviewVersionBefore: 1,
          items: {
            create: stored.currentRevision!.items.map((item) => ({
              approvedQuantity: 3,
              rentalRequestRevisionItemId: item.id,
              requestedQuantitySnapshot: item.requestedQuantity,
            })),
          },
        },
      });
      await tx.rentalRequestActivity.create({
        data: {
          actorUserId: actorId,
          decisionId: decision.id,
          newStatus: 'PARTIALLY_APPROVED',
          previousStatus: 'UNDER_REVIEW',
          rentalRequestId: stored.id,
          type: 'PARTIALLY_APPROVED',
        },
      });
      await tx.rentalRequest.update({
        where: { id: stored.id },
        data: {
          reviewStartedAt: new Date(),
          reviewVersion: 2,
          status: 'PARTIALLY_APPROVED',
        },
      });
    });
    const tracked = (
      await requests.track(
        submitted.rawRequestToken,
        submitted.request.referenceNumber,
      )
    ).request;
    expect(tracked.items[0]?.approvedQuantity).toBe(3);
    expect(tracked.decision).toMatchObject({
      customerExplanation:
        'Please contact Mensah Rentals for an update about your request.',
      outcome: 'PARTIALLY_APPROVED',
    });
    expect(JSON.stringify(tracked)).not.toContain(
      'Only 12 units are available in inventory.',
    );
    expect(JSON.stringify(tracked)).not.toContain(
      'PRIVATE-INTERNAL-DECISION-SENTINEL',
    );
    expectPublicDataSafe(tracked);
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

  it('does not reactivate an expired guest session while a valid request-scoped capability remains usable', async () => {
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
    await expect(
      requests.track(
        submitted.rawRequestToken,
        submitted.request.referenceNumber,
      ),
    ).resolves.toMatchObject({
      request: { referenceNumber: submitted.request.referenceNumber },
    });
    expect(
      (
        await prisma.guestRequestSession.findUniqueOrThrow({
          where: { id: stored.guestSessionId },
        })
      ).expiresAt,
    ).toEqual(expiredAt);
  });

  it('keeps a different cart intact when an idempotency key is reused with changed data', async () => {
    const firstCart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 2,
    });
    const input = payload();
    await requests.submit(firstCart.rawToken, undefined, input);
    const secondCart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 9,
    });
    await expect(
      requests.submit(secondCart.rawToken, undefined, {
        ...input,
        projectName: 'Changed project intent',
      }),
    ).rejects.toThrow(/submission identifier has already been used/i);
    expect((await carts.get(secondCart.rawToken)).cart.desiredUnitCount).toBe(
      9,
    );
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

  it('stores an idempotent complete amendment revision without changing original items or inventory', async () => {
    const firstCart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 5,
    });
    const cart = await carts.setItem(firstCart.rawToken, secondProductSlug, {
      desiredQuantity: 3,
    });
    const submitted = await requests.submit(
      cart.rawToken,
      undefined,
      payload(),
    );
    const stored = await prisma.rentalRequest.findUniqueOrThrow({
      where: { referenceNumber: submitted.request.referenceNumber },
      include: { items: { orderBy: { productId: 'asc' } } },
    });
    const originalItems = stored.items.map((item) => ({
      productId: item.productId,
      requestedQuantity: item.requestedQuantity,
    }));
    const inventoryBefore = {
      inventory: await prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
      }),
      items: await prisma.inventoryItem.count({ where: { inventoryId } }),
      transactions: await prisma.inventoryTransaction.count({
        where: { inventoryId },
      }),
    };
    const fields = revisionFields();
    const input: SubmitRentalRequestAmendmentInput = {
      ...fields,
      amendmentReason: 'The equipment plan changed.',
      expectedRevisionNumber: 1,
      items: [
        { productId, requestedQuantity: 8 },
        { productId: thirdProductId, requestedQuantity: 100 },
      ],
      operationId: randomUUID(),
      projectName: 'Amended integration project',
    };

    const amended = await requests.submitAmendment(
      submitted.rawRequestToken,
      input,
    );
    const replay = await requests.submitAmendment(
      submitted.rawRequestToken,
      input,
    );
    expect(replay.id).toBe(amended.id);
    expect(amended).toMatchObject({
      amendmentReason: input.amendmentReason,
      revisionNumber: 2,
      status: { key: 'RE_REVIEW_REQUIRED' },
    });
    expect(amended.items).toHaveLength(2);
    expectPublicDataSafe(amended);
    expect(JSON.stringify(amended)).not.toMatch(/operationId|payloadHash/i);

    const persisted = await prisma.rentalRequest.findUniqueOrThrow({
      where: { id: stored.id },
      include: {
        currentRevision: { include: { items: true } },
        items: { orderBy: { productId: 'asc' } },
        revisions: { orderBy: { revisionNumber: 'asc' } },
      },
    });
    expect(persisted.status).toBe('RE_REVIEW_REQUIRED');
    expect(
      persisted.revisions.map(({ revisionNumber }) => revisionNumber),
    ).toEqual([1, 2]);
    expect(
      persisted.revisions.filter(
        ({ id }) => id === persisted.currentRevisionId,
      ),
    ).toHaveLength(1);
    expect(
      persisted.items.map((item) => ({
        productId: item.productId,
        requestedQuantity: item.requestedQuantity,
      })),
    ).toEqual(originalItems);
    expect(persisted.currentRevision?.items).toHaveLength(2);

    const comparison = await revisions.comparison(stored.id, amended.id);
    expect(comparison.items.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['ADDED', 'REMOVED', 'QUANTITY_INCREASED']),
    );
    expect(comparison.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'projectName',
          kind: 'FIELD_CHANGED',
        }),
      ]),
    );

    await expect(
      requests.submitAmendment(submitted.rawRequestToken, {
        ...input,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/changed since it was loaded/i);
    await expect(
      requests.submitAmendment(submitted.rawRequestToken, {
        ...input,
        amendmentReason: 'Conflicting operation reuse',
      }),
    ).rejects.toThrow(/operation identifier/i);
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } }),
    ).toEqual(inventoryBefore.inventory);
    expect(await prisma.inventoryItem.count({ where: { inventoryId } })).toBe(
      inventoryBefore.items,
    );
    expect(
      await prisma.inventoryTransaction.count({ where: { inventoryId } }),
    ).toBe(inventoryBefore.transactions);
  });

  it('rejects adding an inactive product to an amendment', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 2,
    });
    const submitted = await requests.submit(
      cart.rawToken,
      undefined,
      payload(),
    );
    const fields = revisionFields();
    await expect(
      requests.submitAmendment(submitted.rawRequestToken, {
        ...fields,
        amendmentReason: 'Try an archived product.',
        expectedRevisionNumber: 1,
        items: [{ productId: inactiveProductId, requestedQuantity: 1 }],
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(/newly added products are no longer listed/i);
  });

  it('uses a formal change request after quote acceptance without mutating the accepted quote or inventory', async () => {
    const cart = await carts.setItem(undefined, productSlug, {
      desiredQuantity: 4,
    });
    const submitted = await requests.submit(
      cart.rawToken,
      undefined,
      payload(),
    );
    const request = await prisma.rentalRequest.findUniqueOrThrow({
      where: { referenceNumber: submitted.request.referenceNumber },
    });
    await prisma.rentalRequest.update({
      where: { id: request.id },
      data: {
        reviewStartedAt: new Date(),
        reviewVersion: 1,
        status: 'UNDER_REVIEW',
      },
    });
    await decisions.approve(actor, request.id, {
      expectedReviewVersion: 1,
      internalReason: 'Formal change-request fixture approval.',
      operationId: randomUUID(),
    });
    const decision = await prisma.rentalRequestDecision.findFirstOrThrow({
      where: { rentalRequestId: request.id },
      include: { items: true },
    });
    const quoteInput: QuoteRevisionInput = {
      charges: [],
      customerNotes: null,
      discountCents: 0,
      discountTaxable: false,
      internalNotes: 'PRIVATE FORMAL CHANGE FIXTURE',
      items: decision.items.map((item) => ({
        quotedQuantity: item.approvedQuantity,
        rentalRequestDecisionItemId: item.id,
        taxable: false,
        unitPriceCents: 1000,
      })),
      operationId: randomUUID(),
      tax: { name: 'No tax', rateBasisPoints: 0 },
      terms: 'Formal change fixture terms.',
      validUntil: '2026-12-01T12:00:00.000Z',
    };
    const quote = await quotes.createFirst(actor, request.id, quoteInput);
    const revision = quote.revisions[0]!;
    const sent = await quotes.send(actor, quote.id, revision.id, {
      expectedLifecycleVersion: 0,
      operationId: randomUUID(),
    });
    await quotes.respond(sent.accessLink.split('#capability=')[1], {
      note: null,
      operationId: randomUUID(),
      response: 'ACCEPTED',
    });
    const acceptedBefore = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: {
        customerRevision: { include: { lifecycle: true } },
        revisions: true,
      },
    });
    const inventoryBefore = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
    });
    const transactionCount = await prisma.inventoryTransaction.count({
      where: { inventoryId },
    });
    const fields = revisionFields();
    const changeInput = {
      ...fields,
      expectedRevisionNumber: 1,
      items: [
        { productId, requestedQuantity: 7 },
        { productId: thirdProductId, requestedQuantity: 2 },
      ],
      operationId: randomUUID(),
      reason: 'The accepted equipment plan needs changes.',
    };

    await expect(
      requests.submitAmendment(submitted.rawRequestToken, {
        ...changeInput,
        amendmentReason: changeInput.reason,
      }),
    ).rejects.toThrow(/formal change request/i);
    const change = await changes.submit(submitted.rawRequestToken, changeInput);
    const replay = await changes.submit(submitted.rawRequestToken, changeInput);
    expect(replay.id).toBe(change.id);
    expect(change).toMatchObject({
      source: 'ACCEPTED_QUOTE',
      status: 'SUBMITTED',
    });
    expect(change.items.map(({ changeType }) => changeType)).toEqual(
      expect.arrayContaining(['ADDED', 'QUANTITY_CHANGED']),
    );
    expectPublicDataSafe(change);
    expect(JSON.stringify(change)).not.toMatch(
      /PRIVATE FORMAL|internalNote|operationId|payloadHash/i,
    );

    await expect(
      prisma.rentalChangeRequest.update({
        where: { id: change.id },
        data: {
          projectName: 'Tampered after submission',
          reviewVersion: { increment: 1 },
        },
      }),
    ).rejects.toThrow(/proposal and source snapshots are immutable/i);

    const underReview = await changes.review(actor, change.id, {
      customerExplanation: null,
      expectedVersion: 0,
      internalNote: 'PRIVATE CHANGE REVIEW NOTE',
      operationId: randomUUID(),
      status: 'UNDER_REVIEW',
    });
    expect(underReview.status).toBe('UNDER_REVIEW');
    const approved = await changes.review(actor, change.id, {
      customerExplanation: 'We will prepare a revised proposal.',
      expectedVersion: 1,
      internalNote: 'Approved for a future replacement quote.',
      operationId: randomUUID(),
      status: 'APPROVED_FOR_REQUOTE',
    });
    expect(approved.status).toBe('APPROVED_FOR_REQUOTE');
    const customerView = await changes.publicDetail(
      submitted.rawRequestToken,
      change.id,
    );
    expect(JSON.stringify(customerView)).not.toContain('PRIVATE CHANGE REVIEW');
    expect(
      await prisma.rentalOrder.count({ where: { quoteId: quote.id } }),
    ).toBe(0);
    expect(
      await prisma.quote.findUniqueOrThrow({
        where: { id: quote.id },
        include: {
          customerRevision: { include: { lifecycle: true } },
          revisions: true,
        },
      }),
    ).toEqual(acceptedBefore);
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } }),
    ).toEqual(inventoryBefore);
    expect(
      await prisma.inventoryTransaction.count({ where: { inventoryId } }),
    ).toBe(transactionCount);
  });
});
