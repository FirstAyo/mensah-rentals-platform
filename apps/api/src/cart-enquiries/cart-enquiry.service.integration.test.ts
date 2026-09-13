import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@mensah-rentals/database';
import { beforeAll, describe, expect, it } from 'vitest';

import { PublicCartService } from '../cart/public-cart.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';
import { CartEnquiryService } from './cart-enquiry.service';
import { OutboundEmailDeliveryService } from './outbound-email-delivery.service';
import {
  SafeCaptureOutboundEmailTransport,
  type OutboundEmailTransport,
} from './outbound-email.transport';

const marker = randomUUID().replaceAll('-', '');
const config = new ConfigService({
  CART_ENQUIRY_RECIPIENT_EMAIL: 'company@example.test',
  NODE_ENV: 'test',
  PUBLIC_CART_TTL_DAYS: 30,
});
const transport = new SafeCaptureOutboundEmailTransport(config);
const delivery = new OutboundEmailDeliveryService(transport);
const service = new CartEnquiryService(config, delivery);
const cart = new PublicCartService(config as never);
let productSlug: string;
let actorId: string;

function input(operationId = randomUUID()) {
  return {
    additionalEquipment: 'Ten black pipe-and-drape panels',
    company: 'Phase 19 Production',
    contactEmail: `customer-${marker}@example.test`,
    contactPhone: '+1 604 555 0100',
    customerName: 'Cart Enquiry Customer',
    customerNotes: 'Please call before delivery.',
    fulfilmentMethod: 'DELIVERY' as const,
    location: 'Richmond, BC',
    operationId,
    projectName: 'Guarded Cart Enquiry Test',
    rentalEndDate: '2026-11-12',
    rentalStartDate: '2026-11-10',
    website: '',
  };
}

beforeAll(async () => {
  await prisma.customerWorkflowSetting.upsert({
    create: { id: 'customer-workflow', mode: 'EMAIL_INQUIRY' },
    update: { mode: 'EMAIL_INQUIRY' },
    where: { id: 'customer-workflow' },
  });
  const category = await prisma.category.create({
    data: { name: `Enquiry ${marker}`, slug: `enquiry-${marker}` },
  });
  productSlug = `enquiry-product-${marker}`;
  await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `Enquiry Product ${marker}`,
      rentalUnit: 'each',
      shortDescription: 'A test-owned cart enquiry product.',
      slug: productSlug,
    },
  });
  const actor = await prisma.user.create({
    data: {
      email: `enquiry-staff-${marker}@example.test`,
      firstName: 'Enquiry',
      lastName: 'Reviewer',
      passwordHash: 'not-a-real-password-hash',
      status: 'ACTIVE',
    },
  });
  actorId = actor.id;
});

describe('cart enquiry persistence and delivery', () => {
  it('stores a complete immutable snapshot, queues company mail, and mutates no operational records', async () => {
    const current = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 100,
    });
    const before = await operationalCounts();
    const receipt = await service.submit(current.rawToken, input());
    expect(receipt.referenceNumber).toMatch(/^MR-\d{8}-[A-F0-9]{8}$/);
    expectPublicDataSafe(receipt);
    expect(await operationalCounts()).toEqual(before);

    const stored = await prisma.cartEnquiry.findUniqueOrThrow({
      include: { items: true, outboundEmails: { include: { attempts: true } } },
      where: { referenceNumber: receipt.referenceNumber! },
    });
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]).toMatchObject({
      productNameSnapshot: `Enquiry Product ${marker}`,
      requestedQuantity: 100,
    });
    expect(stored.outboundEmails[0]).toMatchObject({
      attemptCount: 1,
      recipient: 'company@example.test',
      status: 'SENT',
    });
    expect(stored.outboundEmails[0]?.attempts).toHaveLength(1);
    expect(transport.captured.at(-1)?.textBody).toContain(
      'Ten black pipe-and-drape panels',
    );
    expect(JSON.stringify(receipt)).not.toMatch(
      /inventory|reservation|staff|operationId|payloadHash|token|recipient|emailBody/i,
    );
  });

  it('is idempotent under concurrency and rejects conflicting reuse', async () => {
    const current = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 4,
    });
    const payload = input();
    const [first, second] = await Promise.all([
      service.submit(current.rawToken, payload),
      service.submit(current.rawToken, payload),
    ]);
    expect(first.referenceNumber).toBe(second.referenceNumber);
    expect(
      await prisma.cartEnquiry.count({
        where: { referenceNumber: first.referenceNumber! },
      }),
    ).toBe(1);
    const stored = await prisma.cartEnquiry.findUniqueOrThrow({
      where: { referenceNumber: first.referenceNumber! },
    });
    expect(
      await prisma.outboundEmail.count({ where: { cartEnquiryId: stored.id } }),
    ).toBe(1);
    await expect(
      service.submit(current.rawToken, {
        ...payload,
        customerNotes: 'A different safe note.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const otherCart = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 4,
    });
    await expect(
      service.submit(otherCart.rawToken, payload),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves a failed delivery safely and supports an audited retry', async () => {
    const failingTransport: OutboundEmailTransport = {
      isAvailable: () => true,
      send: async () => {
        throw Object.assign(new Error('secret provider response'), {
          code: 'TEMP-AUTH/unsafe',
        });
      },
    };
    const failingService = new CartEnquiryService(
      config,
      new OutboundEmailDeliveryService(failingTransport),
    );
    const current = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 3,
    });
    const receipt = await failingService.submit(current.rawToken, input());
    const failed = await prisma.cartEnquiry.findUniqueOrThrow({
      include: { outboundEmails: true },
      where: { referenceNumber: receipt.referenceNumber! },
    });
    expect(failed.outboundEmails[0]).toMatchObject({
      attemptCount: 1,
      lastErrorCode: 'TEMP-AUTHunsafe',
      lastErrorMessage:
        'The email provider did not accept this delivery attempt.',
      status: 'FAILED',
    });
    expect(JSON.stringify(failed.outboundEmails[0])).not.toContain(
      'secret provider response',
    );

    await prisma.outboundEmail.update({
      data: { lockedAt: new Date(), status: 'PROCESSING' },
      where: { id: failed.outboundEmails[0]!.id },
    });
    await expect(
      service.retryDelivery(failed.id, actorId, randomUUID()),
    ).rejects.toBeInstanceOf(ConflictException);
    await prisma.outboundEmail.update({
      data: {
        lockedAt: new Date(Date.now() - 11 * 60 * 1000),
        status: 'PROCESSING',
      },
      where: { id: failed.outboundEmails[0]!.id },
    });

    const retryOperation = randomUUID();
    const retried = await service.retryDelivery(
      failed.id,
      actorId,
      retryOperation,
    );
    expect(retried.delivery).toMatchObject({ attemptCount: 2, status: 'SENT' });
    await service.retryDelivery(failed.id, actorId, retryOperation);
    expect(
      await prisma.platformAuditEvent.count({
        where: { sourceKey: `cart-enquiry-email-retry:${retryOperation}` },
      }),
    ).toBe(1);
  });

  it('allows only audited status changes while preserving submission snapshots', async () => {
    const current = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 2,
    });
    const receipt = await service.submit(current.rawToken, input());
    const enquiry = await prisma.cartEnquiry.findUniqueOrThrow({
      where: { referenceNumber: receipt.referenceNumber! },
    });
    const operationId = randomUUID();
    expect(
      await service.updateStatus(enquiry.id, actorId, {
        operationId,
        status: 'READ',
      }),
    ).toMatchObject({ status: 'READ' });
    await service.updateStatus(enquiry.id, actorId, {
      operationId,
      status: 'READ',
    });
    expect(
      await prisma.platformAuditEvent.count({
        where: { sourceKey: `cart-enquiry-status:${operationId}` },
      }),
    ).toBe(1);
    await expect(
      prisma.cartEnquiry.update({
        data: { customerName: 'Rewritten customer' },
        where: { id: enquiry.id },
      }),
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.cartEnquiryItem.updateMany({
        data: { requestedQuantity: 99 },
        where: { cartEnquiryId: enquiry.id },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('leaves the durable email queued when no production transport is configured', async () => {
    const productionConfig = new ConfigService({
      CART_ENQUIRY_RECIPIENT_EMAIL: 'company@example.test',
      NODE_ENV: 'production',
    });
    const productionService = new CartEnquiryService(
      productionConfig,
      new OutboundEmailDeliveryService(
        new SafeCaptureOutboundEmailTransport(productionConfig),
      ),
    );
    const current = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 2,
    });
    const receipt = await productionService.submit(current.rawToken, input());
    const stored = await prisma.cartEnquiry.findUniqueOrThrow({
      include: { outboundEmails: true },
      where: { referenceNumber: receipt.referenceNumber! },
    });
    expect(stored.outboundEmails[0]?.status).toBe('QUEUED');
    expect(stored.outboundEmails[0]?.attemptCount).toBe(0);
  });

  it('honours full-platform mode and never stores honeypot traffic', async () => {
    const current = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 2,
    });
    await prisma.customerWorkflowSetting.update({
      data: { mode: 'PLATFORM_REQUEST' },
      where: { id: 'customer-workflow' },
    });
    await expect(
      service.submit(current.rawToken, input()),
    ).rejects.toBeInstanceOf(ConflictException);
    await prisma.customerWorkflowSetting.update({
      data: { mode: 'EMAIL_INQUIRY' },
      where: { id: 'customer-workflow' },
    });
    const spamOperation = randomUUID();
    expect(
      await service.submit(undefined, {
        ...input(spamOperation),
        website: 'spam.example',
      }),
    ).toMatchObject({ accepted: true, referenceNumber: null });
    expect(
      await prisma.cartEnquiry.findUnique({
        where: { operationId: spamOperation },
      }),
    ).toBeNull();
  });

  it('serializes email enquiry submission with a customer workflow mode change', async () => {
    const current = await cart.setItem(undefined, productSlug, {
      desiredQuantity: 2,
    });
    let releaseWriter!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    let writerLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      writerLocked = resolve;
    });
    const writer = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1885, 1)`;
      await tx.customerWorkflowSetting.update({
        data: { mode: 'PLATFORM_REQUEST' },
        where: { id: 'customer-workflow' },
      });
      writerLocked();
      await release;
    });
    await locked;
    const submission = service.submit(current.rawToken, input());
    releaseWriter();
    await writer;
    await expect(submission).rejects.toBeInstanceOf(ConflictException);
    await prisma.customerWorkflowSetting.update({
      data: { mode: 'EMAIL_INQUIRY' },
      where: { id: 'customer-workflow' },
    });
  });
});

async function operationalCounts() {
  const [
    activeRentals,
    inventory,
    inventoryItems,
    inventoryTransactions,
    orders,
    quotes,
    rentalRequests,
    reservations,
  ] = await Promise.all([
    prisma.activeRental.count(),
    prisma.inventory.count(),
    prisma.inventoryItem.count(),
    prisma.inventoryTransaction.count(),
    prisma.rentalOrder.count(),
    prisma.quote.count(),
    prisma.rentalRequest.count(),
    prisma.inventoryReservation.count(),
  ]);
  return {
    activeRentals,
    inventory,
    inventoryItems,
    inventoryTransactions,
    orders,
    quotes,
    rentalRequests,
    reservations,
  };
}
