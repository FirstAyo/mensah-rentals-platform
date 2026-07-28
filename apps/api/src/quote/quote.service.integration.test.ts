import { createHash, randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type { StaffUserResponse } from '@mensah-rentals/types';
import type {
  ApiEnvironment,
  QuoteRevisionInput,
} from '@mensah-rentals/validation';
import { beforeAll, describe, expect, it } from 'vitest';

import { QuoteService } from './quote.service';
import { RentalRequestDecisionService } from '../rental-request/rental-request-decision.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';

describe('custom quotes against PostgreSQL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const quoteService = new QuoteService({
    get(key: keyof ApiEnvironment) {
      if (key === 'PUBLIC_QUOTE_ACCESS_SECRET')
        return 'test-only-quote-capability-secret-123456789';
      if (key === 'PUBLIC_QUOTE_ACCESS_TTL_DAYS') return 30;
      if (key === 'WEB_ORIGIN') return 'http://localhost:3000';
      throw new Error(`Unexpected configuration ${key}`);
    },
  } as ConfigService<ApiEnvironment, true>);
  const decisions = new RentalRequestDecisionService();
  let actor: StaffUserResponse;
  let productId: string;

  const hash = (value: string) =>
    createHash('sha256').update(`${suffix}:${value}`).digest('hex');

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });
    const user = await prisma.user.create({
      data: {
        email: `quote-${suffix}@example.test`,
        firstName: 'Quote',
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
      data: { name: `Quote ${suffix}`, slug: `quote-${suffix}` },
    });
    productId = (
      await prisma.product.create({
        data: {
          categoryId: category.id,
          name: `Chair ${suffix}`,
          shortDescription: 'Quote fixture',
          slug: `chair-${suffix}`,
        },
      })
    ).id;
  });

  async function request(
    label: string,
    status: 'UNDER_REVIEW' | 'SUBMITTED' = 'UNDER_REVIEW',
  ) {
    return prisma.rentalRequest.create({
      data: {
        contactEmail: `${label}-${suffix}@example.test`,
        contactFirstName: 'Customer',
        contactLastName: label,
        contactPhone: '+233 20 000 0000',
        fulfillmentMethod: 'PICKUP',
        projectLocation: 'Accra',
        projectName: label,
        projectType: 'Event',
        referenceNumber: `MR-2026-${hash(label).slice(0, 10).toUpperCase()}`,
        rentalEndDate: new Date('2027-02-02T00:00:00Z'),
        rentalStartDate: new Date('2027-02-01T00:00:00Z'),
        requestedTimeZone: 'Africa/Accra',
        reviewStartedAt: status === 'UNDER_REVIEW' ? new Date() : null,
        reviewVersion: status === 'UNDER_REVIEW' ? 1 : 0,
        sourceCartTokenHash: hash(`${label}:cart`),
        status,
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
  }

  async function approved(label: string, partial = false) {
    const created = await request(label);
    if (partial)
      await decisions.partiallyApprove(actor, created.id, {
        operationId: randomUUID(),
        expectedReviewVersion: 1,
        internalReason: 'Fixture partial approval',
        customerExplanation: 'We can support part of your request.',
        items: [
          { rentalRequestItemId: created.items[0]!.id, approvedQuantity: 6 },
        ],
      });
    else
      await decisions.approve(actor, created.id, {
        operationId: randomUUID(),
        expectedReviewVersion: 1,
        internalReason: 'Fixture approval',
      });
    return created;
  }

  async function input(
    requestId: string,
    operationId = randomUUID(),
  ): Promise<QuoteRevisionInput> {
    const decision = await prisma.rentalRequestDecision.findUniqueOrThrow({
      where: { rentalRequestId: requestId },
      include: { items: true },
    });
    return {
      operationId,
      items: decision.items
        .filter(({ approvedQuantity }) => approvedQuantity > 0)
        .map((item) => ({
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
      customerNotes: 'Customer-safe note',
      internalNotes: 'PRIVATE SENTINEL',
      terms: 'Test terms',
      validUntil: '2027-01-31T12:00:00.000Z',
    };
  }

  const rawCapability = (accessLink: string) =>
    accessLink.split('#capability=')[1]!;

  const fulfilled = <T>(
    result: PromiseSettledResult<T>,
  ): result is PromiseFulfilledResult<T> => result.status === 'fulfilled';

  async function createSentQuote(label: string) {
    const source = await approved(label);
    const quote = await quoteService.createFirst(
      actor,
      source.id,
      await input(source.id),
    );
    const revision = quote.revisions[0]!;
    const sent = await quoteService.send(actor, quote.id, revision.id, {
      operationId: randomUUID(),
      expectedLifecycleVersion: 0,
    });
    return {
      quote,
      raw: rawCapability(sent.accessLink),
      revision,
      source,
    };
  }

  it('creates exact immutable quotes only from approved decisions without inventory mutation', async () => {
    const approvedRequest = await approved('approved');
    const before = await prisma.inventoryTransaction.count();
    const quote = await quoteService.createFirst(
      actor,
      approvedRequest.id,
      await input(approvedRequest.id),
    );
    expect(quote.revisions[0]).toMatchObject({
      itemSubtotalCents: 125500,
      chargeTotalCents: 5000,
      subtotalCents: 130500,
      discountCents: 2500,
      taxableSubtotalCents: 128000,
      taxCents: 6400,
      totalCents: 134400,
      status: 'DRAFT',
    });
    expect(quote.revisions[0]!.items[0]).toMatchObject({
      approvedQuantity: 10,
      quotedQuantity: 10,
      productName: 'Folding Chair',
    });
    await expect(
      quoteService.staffPdf(quote.id, quote.latestRevisionId),
    ).rejects.toThrow('must be sent');
    await expect(
      prisma.quoteRevision.update({
        where: { id: quote.latestRevisionId },
        data: { revisionNumber: 2 },
      }),
    ).rejects.toThrow(/identity|immutable/i);
    const draftItem = await prisma.quoteRevisionItem.findFirstOrThrow({
      where: { quoteRevisionId: quote.latestRevisionId },
    });
    await expect(
      prisma.quoteRevisionItem.update({
        where: { id: draftItem.id },
        data: { productNameSnapshot: 'Tampered draft snapshot' },
      }),
    ).rejects.toThrow(/replaced|not updated/i);
    expect(await prisma.inventoryTransaction.count()).toBe(before);
    const original = await prisma.rentalRequestItem.findFirstOrThrow({
      where: { rentalRequestId: approvedRequest.id },
    });
    expect(original.requestedQuantity).toBe(10);
    const correctedInput = await input(approvedRequest.id);
    correctedInput.expectedLatestRevisionNumber = 1;
    correctedInput.expectedDraftVersion = 0;
    correctedInput.items[0]!.unitPriceCents = 12600;
    const corrected = await quoteService.updateDraft(
      actor,
      quote.id,
      quote.latestRevisionId,
      correctedInput,
    );
    expect(corrected).toMatchObject({
      draftVersion: 1,
      revisionNumber: 1,
      status: 'DRAFT',
    });
    await expect(
      quoteService.createRevision(actor, quote.id, {
        ...correctedInput,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('Edit the latest unsent draft');
    await expect(
      prisma.quoteRevisionLifecycle.update({
        where: { quoteRevisionId: quote.latestRevisionId },
        data: { terminalAt: new Date('2030-01-01T00:00:00Z') },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.quote.update({
        where: { id: quote.id },
        data: { quoteNumber: 'QT-TAMPERED' },
      }),
    ).rejects.toThrow();
  });

  it('supports partial approval, bounds quantities, and idempotent first creation', async () => {
    const partial = await approved('partial', true);
    const operationId = randomUUID();
    const proposal = await input(partial.id, operationId);
    const first = await quoteService.createFirst(actor, partial.id, proposal);
    const replay = await quoteService.createFirst(actor, partial.id, proposal);
    expect(replay.id).toBe(first.id);
    await expect(
      quoteService.createFirst(actor, partial.id, {
        ...proposal,
        customerNotes: 'Changed payload with reused operation',
      }),
    ).rejects.toThrow('used differently');
    await expect(
      quoteService.createFirst(actor, (await approved('over')).id, {
        ...(await input(
          (
            await prisma.rentalRequest.findUniqueOrThrow({
              where: {
                referenceNumber: `MR-2026-${hash('over').slice(0, 10).toUpperCase()}`,
              },
            })
          ).id,
        )),
        items: [{ ...proposal.items[0]!, quotedQuantity: 999 }],
      }),
    ).rejects.toThrow();
  });

  it('calculates and snapshots percentage discounts authoritatively', async () => {
    const source = await approved('percentage-discount');
    const proposal = await input(source.id);
    proposal.discountType = 'PERCENTAGE';
    proposal.discountRateBasisPoints = 1_000;
    proposal.discountCents = 0;
    const quote = await quoteService.createFirst(actor, source.id, proposal);
    expect(quote.revisions[0]).toMatchObject({
      discountBaseCents: 130_500,
      discountCents: 13_050,
      discountRateBasisPoints: 1_000,
      discountType: 'PERCENTAGE',
      taxableDiscountCents: 13_050,
      taxableSubtotalCents: 117_450,
      taxCents: 5_873,
      totalCents: 123_323,
    });
  });

  it('edits only the latest draft in place with idempotency and stale-write protection', async () => {
    const source = await approved('draft-edit');
    const quote = await quoteService.createFirst(
      actor,
      source.id,
      await input(source.id),
    );
    const update = await input(source.id);
    update.expectedDraftVersion = 0;
    update.expectedLatestRevisionNumber = 1;
    update.customerNotes = 'Updated safely in place';
    const first = await quoteService.updateDraft(
      actor,
      quote.id,
      quote.latestRevisionId,
      update,
    );
    const replay = await quoteService.updateDraft(
      actor,
      quote.id,
      quote.latestRevisionId,
      update,
    );
    expect(first).toMatchObject({ draftVersion: 1, revisionNumber: 1 });
    expect(replay).toEqual(first);
    expect(
      await prisma.quoteActivity.count({
        where: { quoteId: quote.id, type: 'QUOTE_DRAFT_UPDATED' },
      }),
    ).toBe(1);
    await expect(
      quoteService.updateDraft(actor, quote.id, quote.latestRevisionId, {
        ...update,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('changed');
  });

  it('rejects ineligible request states', async () => {
    const submitted = await request('submitted', 'SUBMITTED');
    const fake = {
      operationId: randomUUID(),
      items: [
        {
          rentalRequestDecisionItemId: 'cm00000000000000000000000',
          quotedQuantity: 1,
          unitPriceCents: 100,
          taxable: true,
        },
      ],
      charges: [],
      discountCents: 0,
      discountTaxable: true,
      tax: { name: 'Tax', rateBasisPoints: 0 },
      validUntil: '2027-01-31T12:00:00.000Z',
    } satisfies QuoteRevisionInput;
    await expect(
      quoteService.createFirst(actor, submitted.id, fake),
    ).rejects.toThrow('approved');
  });

  it('accepts idempotently without automatically creating orders or reservations', async () => {
    const source = await approved('send');
    const quote = await quoteService.createFirst(
      actor,
      source.id,
      await input(source.id),
    );
    const revision = quote.revisions[0]!;
    const sendOperation = randomUUID();
    const sent = await quoteService.send(actor, quote.id, revision.id, {
      operationId: sendOperation,
      expectedLifecycleVersion: 0,
    });
    const replay = await quoteService.send(actor, quote.id, revision.id, {
      operationId: sendOperation,
      expectedLifecycleVersion: 0,
    });
    expect(replay.accessLink).toBe(sent.accessLink);
    const raw = sent.accessLink.split('#capability=')[1]!;
    const access = await prisma.quoteCustomerAccess.findFirstOrThrow({
      where: { quoteRevisionId: revision.id, revokedAt: null },
    });
    expect(access.tokenHash).not.toContain(raw);
    const publicQuote = await quoteService.publicCurrent(raw);
    expectPublicDataSafe(publicQuote);
    expect(JSON.stringify(publicQuote)).not.toContain('PRIVATE SENTINEL');
    expect(publicQuote.notice).toContain('not a confirmed rental order');
    const inventoryBefore = await prisma.inventoryTransaction.count();
    const operationId = randomUUID();
    const accepted = await quoteService.respond(raw, {
      operationId,
      response: 'ACCEPTED',
      note: null,
    });
    const acceptedReplay = await quoteService.respond(raw, {
      operationId,
      response: 'ACCEPTED',
      note: null,
    });
    expect(accepted.status).toBe('ACCEPTED');
    expect(acceptedReplay.status).toBe('ACCEPTED');
    expect(await prisma.inventoryTransaction.count()).toBe(inventoryBefore);
    expect(
      await prisma.rentalOrder.count({ where: { quoteId: quote.id } }),
    ).toBe(0);
    const [reservation] = await prisma.$queryRaw<
      Array<{ name: string | null }>
    >`
      SELECT to_regclass('public."Reservation"')::TEXT AS name
    `;
    expect(reservation?.name).toBeNull();
  });

  it('resends without a revision and rotates access with immediate revocation', async () => {
    const { quote, raw, revision } = await createSentQuote('resend-rotate');
    const current = await prisma.quoteCustomerAccess.findFirstOrThrow({
      where: { quoteRevisionId: revision.id, revokedAt: null },
    });
    const resend = await quoteService.resend(actor, quote.id, revision.id, {
      expectedAccessId: current.id,
      expectedLifecycleVersion: 1,
      operationId: randomUUID(),
    });
    expect(rawCapability(resend.accessLink)).toBe(raw);
    expect(
      await prisma.quoteRevision.count({ where: { quoteId: quote.id } }),
    ).toBe(1);
    expect(
      await prisma.quoteActivity.count({
        where: { quoteId: quote.id, type: 'QUOTE_RESENT' },
      }),
    ).toBe(1);
    const rotated = await quoteService.rotateAccess(
      actor,
      quote.id,
      revision.id,
      {
        expectedAccessId: current.id,
        expectedLifecycleVersion: 1,
        operationId: randomUUID(),
      },
    );
    expect(rawCapability(rotated.accessLink)).not.toBe(raw);
    await expect(quoteService.publicCurrent(raw)).rejects.toThrow(
      'Quote is unavailable',
    );
    await expect(
      quoteService.publicCurrent(rawCapability(rotated.accessLink)),
    ).resolves.toMatchObject({ quoteNumber: quote.quoteNumber });
    expect(
      await prisma.quoteCustomerAccess.count({
        where: { quoteRevisionId: revision.id },
      }),
    ).toBe(2);
    expect(
      await prisma.quoteActivity.count({
        where: { quoteId: quote.id, type: 'QUOTE_ACCESS_ROTATED' },
      }),
    ).toBe(1);
    await expect(
      prisma.quoteRevision.update({
        where: { id: revision.id },
        data: { customerNotes: 'tampered after send' },
      }),
    ).rejects.toThrow();
  });

  it('renders customer-safe selectable PDFs from immutable snapshots', async () => {
    const { quote, raw, revision } = await createSentQuote('pdf');
    const current = await quoteService.publicCurrent(raw);
    expect(current.customerName).toBe('Customer pdf');
    expect(current.rentalStartDate).toBe('2027-02-01');
    const staffPdf = await quoteService.staffPdf(quote.id, revision.id);
    const customerPdf = await quoteService.publicPdf(raw);
    for (const pdf of [staffPdf, customerPdf]) {
      const text = pdf.buffer.toString('ascii');
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text).toContain('Mensah Rentals Quote');
      expect(text).toContain('Status: SENT');
      expect(text).toContain('Rental dates: 2027-02-01 to 2027-02-02');
      expect(text).toContain('Folding Chair');
      expect(text).toContain('10 each x $125.50 = $1,255.00');
      expect(text).toContain('Delivery: $50.00');
      expect(text).toContain('Discount: -$25.00');
      expect(text).toContain('Test tax \\(5.00%\\): $64.00');
      expect(text).toContain('Total: $1,344.00 CAD');
      expect(text).toContain('Terms: Test terms');
      expect(text).toContain('Inventory is not reserved');
      expect(text).not.toContain('PRIVATE SENTINEL');
      expect(text).not.toContain(raw);
      expect(text).not.toContain('tokenHash');
    }
    await expect(quoteService.publicPdf('malformed')).rejects.toThrow(
      'Quote is unavailable',
    );
  });

  it('serializes concurrent first-quote creation for one rental request', async () => {
    const source = await approved('concurrent-first');
    const attempts = await Promise.allSettled([
      quoteService.createFirst(actor, source.id, await input(source.id)),
      quoteService.createFirst(actor, source.id, await input(source.id)),
    ]);
    expect(attempts.filter(fulfilled)).toHaveLength(1);
    expect(attempts.filter((result) => !fulfilled(result))).toHaveLength(1);
    expect(
      await prisma.quote.count({ where: { rentalRequestId: source.id } }),
    ).toBe(1);
    expect(
      await prisma.quoteRevision.count({
        where: { quote: { rentalRequestId: source.id } },
      }),
    ).toBe(1);
  });

  it('serializes concurrent draft edits and rejects the stale writer', async () => {
    const source = await approved('concurrent-revision');
    const quote = await quoteService.createFirst(
      actor,
      source.id,
      await input(source.id),
    );
    const first = await input(source.id);
    first.expectedLatestRevisionNumber = 1;
    first.expectedDraftVersion = 0;
    first.customerNotes = 'First concurrent correction';
    const second = await input(source.id);
    second.expectedLatestRevisionNumber = 1;
    second.expectedDraftVersion = 0;
    second.customerNotes = 'Second concurrent correction';
    const attempts = await Promise.allSettled([
      quoteService.updateDraft(actor, quote.id, quote.latestRevisionId, first),
      quoteService.updateDraft(actor, quote.id, quote.latestRevisionId, second),
    ]);
    expect(attempts.filter(fulfilled)).toHaveLength(1);
    expect(attempts.filter((result) => !fulfilled(result))).toHaveLength(1);
    expect(
      await prisma.quoteRevision.count({ where: { quoteId: quote.id } }),
    ).toBe(1);
    const persisted = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { latestRevision: true },
    });
    expect(persisted.latestRevision).toMatchObject({
      draftVersion: 1,
      revisionNumber: 1,
    });
  });

  it('allows only one simultaneous customer accept-or-reject decision', async () => {
    const { quote, raw, revision } = await createSentQuote(
      'simultaneous-response',
    );
    const attempts = await Promise.allSettled([
      quoteService.respond(raw, {
        operationId: randomUUID(),
        response: 'ACCEPTED',
        note: null,
      }),
      quoteService.respond(raw, {
        operationId: randomUUID(),
        response: 'REJECTED',
        note: 'Not proceeding',
      }),
    ]);
    expect(attempts.filter(fulfilled)).toHaveLength(1);
    expect(attempts.filter((result) => !fulfilled(result))).toHaveLength(1);
    expect(
      await prisma.quoteCustomerResponse.count({
        where: { quoteRevisionId: revision.id },
      }),
    ).toBe(1);
    const lifecycle = await prisma.quoteRevisionLifecycle.findUniqueOrThrow({
      where: { quoteRevisionId: revision.id },
    });
    expect(['ACCEPTED', 'REJECTED']).toContain(lifecycle.state);
    expect(
      await prisma.quoteActivity.count({
        where: {
          quoteId: quote.id,
          type: { in: ['QUOTE_ACCEPTED', 'QUOTE_REJECTED'] },
        },
      }),
    ).toBe(1);
  });

  it('records an explicit customer rejection and its activity', async () => {
    const { quote, raw, revision } = await createSentQuote('rejection');
    const rejected = await quoteService.respond(raw, {
      operationId: randomUUID(),
      response: 'REJECTED',
      note: 'The event plans changed.',
    });
    expect(rejected.status).toBe('REJECTED');
    await expect(quoteService.publicCurrent(raw)).resolves.toMatchObject({
      status: 'REJECTED',
    });
    expect(
      await prisma.quoteCustomerResponse.findUnique({
        where: { quoteRevisionId: revision.id },
      }),
    ).toMatchObject({
      note: 'The event plans changed.',
      response: 'REJECTED',
    });
    expect(
      await prisma.quoteActivity.count({
        where: { quoteId: quote.id, type: 'QUOTE_REJECTED' },
      }),
    ).toBe(1);
  });

  it('persists expiry and a single expiry activity when a response arrives late', async () => {
    const source = await approved('expiry');
    const expiringInput = await input(source.id);
    expiringInput.validUntil = new Date(Date.now() + 1_000).toISOString();
    const quote = await quoteService.createFirst(
      actor,
      source.id,
      expiringInput,
    );
    const revision = quote.revisions[0]!;
    const sent = await quoteService.send(actor, quote.id, revision.id, {
      operationId: randomUUID(),
      expectedLifecycleVersion: 0,
    });
    const raw = rawCapability(sent.accessLink);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await expect(
      quoteService.respond(raw, {
        operationId: randomUUID(),
        response: 'ACCEPTED',
        note: null,
      }),
    ).rejects.toThrow('no longer actionable');
    const lifecycle = await prisma.quoteRevisionLifecycle.findUniqueOrThrow({
      where: { quoteRevisionId: revision.id },
    });
    expect(lifecycle).toMatchObject({ state: 'EXPIRED', lifecycleVersion: 2 });
    expect(lifecycle.terminalAt).not.toBeNull();
    expect(
      await prisma.quoteActivity.count({
        where: { quoteId: quote.id, type: 'QUOTE_EXPIRED' },
      }),
    ).toBe(1);
    expect(
      await prisma.quoteCustomerResponse.count({
        where: { quoteRevisionId: revision.id },
      }),
    ).toBe(0);
    await expect(quoteService.publicCurrent(raw)).rejects.toThrow();
  });

  it('supersedes the previously sent revision and revokes its capability', async () => {
    const { quote, raw: oldRaw, source } = await createSentQuote('supersede');
    const revisionInput = await input(source.id);
    revisionInput.expectedLatestRevisionNumber = 1;
    revisionInput.customerNotes = 'Replacement revision';
    const replacement = await quoteService.createRevision(
      actor,
      quote.id,
      revisionInput,
    );
    const sent = await quoteService.send(actor, quote.id, replacement.id, {
      operationId: randomUUID(),
      expectedLifecycleVersion: 0,
    });
    const oldRevision = quote.revisions[0]!;
    expect(
      await prisma.quoteRevisionLifecycle.findUniqueOrThrow({
        where: { quoteRevisionId: oldRevision.id },
      }),
    ).toMatchObject({ state: 'SUPERSEDED' });
    expect(
      (
        await prisma.quoteCustomerAccess.findFirstOrThrow({
          where: { quoteRevisionId: oldRevision.id },
        })
      ).revokedAt,
    ).not.toBeNull();
    await expect(quoteService.publicCurrent(oldRaw)).rejects.toThrow();
    await expect(
      quoteService.publicCurrent(rawCapability(sent.accessLink)),
    ).resolves.toMatchObject({ revisionNumber: 2, status: 'SENT' });
  });

  it('rechecks disabled status and permission grants inside write transactions', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });
    const user = await prisma.user.create({
      data: {
        email: `revoked-quote-${suffix}@example.test`,
        firstName: 'Revoked',
        lastName: 'Writer',
        passwordHash: 'unused',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    const staleActor: StaffUserResponse = {
      ...actor,
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      permissionKeys: role.permissions.map(({ permission }) => permission.key),
      updatedAt: user.updatedAt.toISOString(),
    };
    const disabledSource = await approved('disabled-writer');
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'DISABLED' },
    });
    await expect(
      quoteService.createFirst(
        staleActor,
        disabledSource.id,
        await input(disabledSource.id),
      ),
    ).rejects.toThrow('Insufficient permissions');
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE' },
    });
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
    });
    const revokedSource = await approved('permission-revoked-writer');
    await expect(
      quoteService.createFirst(
        staleActor,
        revokedSource.id,
        await input(revokedSource.id),
      ),
    ).rejects.toThrow('Insufficient permissions');
    expect(
      await prisma.quote.count({
        where: {
          rentalRequestId: { in: [disabledSource.id, revokedSource.id] },
        },
      }),
    ).toBe(0);
  });

  it('leaves complete inventory records unchanged through the quote lifecycle', async () => {
    const sourceProduct = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const bulkProduct = await prisma.product.create({
      data: {
        categoryId: sourceProduct.categoryId,
        name: `Bulk quote fixture ${suffix}`,
        shortDescription: 'Bulk quote non-mutation fixture',
        slug: `bulk-quote-${suffix}`,
      },
    });
    const serializedInventory = await prisma.inventory.create({
      data: {
        productId,
        creationOperationId: randomUUID(),
        creationReason: 'Quote non-mutation fixture',
        initialState: 'RENTABLE',
        trackingMode: 'SERIALIZED',
      },
    });
    const item = await prisma.inventoryItem.create({
      data: {
        inventoryId: serializedInventory.id,
        assetNumber: `QUOTE-${suffix.toUpperCase()}`,
        serialNumber: `SERIAL-${suffix}`,
        status: 'RENTABLE',
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        actorUserId: actor.id,
        inventoryId: serializedInventory.id,
        inventoryItemId: item.id,
        kind: 'SERIALIZED_ITEM_CREATED',
        operationId: randomUUID(),
        quantity: 1,
        reason: 'Quote non-mutation fixture',
        toState: 'RENTABLE',
      },
    });
    const bulkInventory = await prisma.inventory.create({
      data: {
        productId: bulkProduct.id,
        creationOperationId: randomUUID(),
        creationReason: 'Bulk quote non-mutation fixture',
        initialState: 'RENTABLE',
        trackingMode: 'BULK',
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        actorUserId: actor.id,
        inventoryId: bulkInventory.id,
        kind: 'INITIAL_STOCK',
        operationId: randomUUID(),
        quantity: 25,
        reason: 'Bulk quote non-mutation fixture',
        toState: 'RENTABLE',
      },
    });
    const inventoryIds = [serializedInventory.id, bulkInventory.id];
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
    const source = await approved('inventory-snapshot');
    const quote = await quoteService.createFirst(
      actor,
      source.id,
      await input(source.id),
    );
    expect(await snapshot()).toEqual(before);
    const revisionInput = await input(source.id);
    revisionInput.expectedLatestRevisionNumber = 1;
    revisionInput.expectedDraftVersion = 0;
    const revision = await quoteService.updateDraft(
      actor,
      quote.id,
      quote.latestRevisionId,
      revisionInput,
    );
    expect(await snapshot()).toEqual(before);
    const sent = await quoteService.send(actor, quote.id, revision.id, {
      operationId: randomUUID(),
      expectedLifecycleVersion: 0,
    });
    expect(await snapshot()).toEqual(before);
    const raw = rawCapability(sent.accessLink);
    await quoteService.markViewed(raw);
    expect(await snapshot()).toEqual(before);
    await quoteService.respond(raw, {
      operationId: randomUUID(),
      response: 'ACCEPTED',
      note: null,
    });
    expect(await snapshot()).toEqual(before);
  });
});
