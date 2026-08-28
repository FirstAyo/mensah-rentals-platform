import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { prisma } from '@mensah-rentals/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ContactEnquiryService } from './contact-enquiry.service';

const service = new ContactEnquiryService();
const marker = randomUUID().replaceAll('-', '');
const actorId = `c${marker.slice(0, 24)}`;
function input(operationId = randomUUID()) {
  return {
    company: 'Test Production',
    email: `customer-${marker}@example.test`,
    enquiryType: 'RENTAL_PROJECT' as const,
    message: 'We need equipment for a guarded integration test production.',
    name: 'Test Customer',
    operationId,
    phone: null,
    website: '',
  };
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      email: `contact-staff-${marker}@example.test`,
      firstName: 'Contact',
      id: actorId,
      lastName: 'Reviewer',
      passwordHash: 'not-a-real-password-hash',
      status: 'ACTIVE',
    },
  });
});

afterAll(async () => {
  // Audit events and their source enquiry are deliberately immutable. The
  // guarded test database is reset before each repository test run, so this
  // suite must not weaken production integrity merely to delete its fixture.
  await prisma.$disconnect();
});

describe('contact enquiry persistence', () => {
  it('stores one allowlisted enquiry and returns only a safe receipt', async () => {
    const before = await operationalCounts();
    const result = await service.submit(input());
    expect(result).toMatchObject({ accepted: true });
    expect(result.referenceNumber).toMatch(/^ENQ-\d{8}-[A-F0-9]{8}$/);
    expect(JSON.stringify(result)).not.toMatch(
      /payloadHash|operationId|inventory|permission|staff|session|capability/i,
    );
    expect(await operationalCounts()).toEqual(before);
  });

  it('is concurrency-safe and rejects conflicting operation reuse', async () => {
    const operationId = randomUUID();
    const payload = input(operationId);
    const [first, second] = await Promise.all([
      service.submit(payload),
      service.submit(payload),
    ]);
    expect(first.referenceNumber).toBe(second.referenceNumber);
    expect(await prisma.contactEnquiry.count({ where: { operationId } })).toBe(
      1,
    );
    await expect(
      service.submit({
        ...payload,
        message: 'A different sufficiently long message.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('silently accepts the honeypot without storing a record', async () => {
    const payload = input();
    const result = await service.submit({
      ...payload,
      website: 'https://spam.example',
    });
    expect(result).toEqual(
      expect.objectContaining({ accepted: true, referenceNumber: null }),
    );
    expect(
      await prisma.contactEnquiry.findUnique({
        where: { operationId: payload.operationId },
      }),
    ).toBeNull();
  });

  it('supports audited staff status changes while submission fields remain immutable', async () => {
    const receipt = await service.submit(input());
    const enquiry = await prisma.contactEnquiry.findUniqueOrThrow({
      where: { referenceNumber: receipt.referenceNumber! },
    });
    const operationId = randomUUID();
    const updated = await service.updateStatus(enquiry.id, actorId, {
      operationId,
      status: 'READ',
    });
    expect(updated.status).toBe('READ');
    expect(updated.statusUpdatedBy?.id).toBe(actorId);
    expect(
      await prisma.platformAuditEvent.count({
        where: { sourceKey: `contact-enquiry-status:${operationId}` },
      }),
    ).toBe(1);
    await service.updateStatus(enquiry.id, actorId, {
      operationId,
      status: 'READ',
    });
    expect(
      await prisma.platformAuditEvent.count({
        where: { sourceKey: `contact-enquiry-status:${operationId}` },
      }),
    ).toBe(1);
    await expect(
      prisma.contactEnquiry.update({
        data: { name: 'Rewritten customer' },
        where: { id: enquiry.id },
      }),
    ).rejects.toThrow(/immutable/i);
  });
});

async function operationalCounts() {
  const [inventory, items, transactions, reservations] = await Promise.all([
    prisma.inventory.count(),
    prisma.inventoryItem.count(),
    prisma.inventoryTransaction.count(),
    prisma.inventoryReservation.count(),
  ]);
  return { inventory, items, reservations, transactions };
}
