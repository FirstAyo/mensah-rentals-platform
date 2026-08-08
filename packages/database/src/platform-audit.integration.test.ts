import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from './index';

describe('platform audit-event integrity', () => {
  afterAll(async () => prisma.$disconnect());

  it('stores a bounded cross-domain event and prevents duplicate source keys', async () => {
    const event = await prisma.platformAuditEvent.create({
      data: {
        action: 'REPORT_EXPORT_GENERATED',
        domain: 'REPORTING',
        entityReference: 'rental-requests',
        metadata: { rowCount: 2 },
        sourceKey: 'test:report-export:one',
        summary: 'A bounded rental-request report was exported.',
      },
    });
    expect(event.summary).not.toContain('password');
    await expect(
      prisma.platformAuditEvent.create({
        data: {
          action: 'REPORT_EXPORT_GENERATED',
          domain: 'REPORTING',
          sourceKey: 'test:report-export:one',
          summary: 'Duplicate retry.',
        },
      }),
    ).rejects.toThrow();
  });

  it('is append-only at the database boundary', async () => {
    const event = await prisma.platformAuditEvent.findUniqueOrThrow({
      where: { sourceKey: 'test:report-export:one' },
    });
    await expect(
      prisma.platformAuditEvent.update({
        data: { summary: 'Rewritten.' },
        where: { id: event.id },
      }),
    ).rejects.toThrow(/append-only/i);
    await expect(
      prisma.platformAuditEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow(/append-only/i);
  });
});
