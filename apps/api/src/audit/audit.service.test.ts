import { prisma } from '@mensah-rentals/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from './audit.service';
import { auditQuerySchema } from './audit.schemas';

describe('audit safe projection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('omits nullable entity keys so export events satisfy the strict DTO', () => {
    const entry = (
      new AuditService() as unknown as {
        map(row: Record<string, unknown>): {
          entity: Record<string, unknown>;
        };
      }
    ).map({
      action: 'REPORT_EXPORT_GENERATED',
      actor_id: null,
      actor_name: null,
      domain: 'REPORTING',
      entity_id: null,
      entity_reference: 'rental-requests',
      entity_type: 'REPORT',
      id: 'event-id',
      occurred_at: new Date('2026-08-08T00:00:00.000Z'),
      source: 'PLATFORM',
      summary: 'Report exported.',
    });
    expect(entry.entity).toEqual({
      reference: 'rental-requests',
      type: 'REPORT',
    });
  });

  it('rejects impossible calendar dates', () => {
    expect(
      auditQuerySchema.safeParse({
        preset: 'CUSTOM',
        startDate: '2026-02-31',
        endDate: '2026-03-02',
      }).success,
    ).toBe(false);
  });

  it('exports all bounded pages, neutralizes formulas, and records an export event', async () => {
    const service = new AuditService();
    const list = vi.spyOn(service, 'list');
    list
      .mockResolvedValueOnce({
        items: [
          {
            action: 'UPDATED',
            actor: { id: 'actor', name: '=Unsafe actor' },
            domain: 'PRODUCT',
            entity: { reference: 'P-1', type: 'PRODUCT' },
            id: 'one',
            occurredAt: '2026-08-01T00:00:00.000Z',
            source: 'PLATFORM',
            summary: 'Safe summary',
          },
        ],
        meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        range: {
          endDate: '2026-08-08',
          startDate: '2026-08-01',
          timeZone: 'Africa/Accra',
        },
      } as never)
      .mockResolvedValueOnce({
        items: [
          {
            action: 'CREATED',
            actor: null,
            domain: 'ORDER',
            entity: null,
            id: 'two',
            occurredAt: '2026-08-02T00:00:00.000Z',
            source: 'PLATFORM',
            summary: '+Unsafe summary',
          },
        ],
        meta: { page: 2, pageSize: 100, total: 2, totalPages: 1 },
        range: {
          endDate: '2026-08-08',
          startDate: '2026-08-01',
          timeZone: 'Africa/Accra',
        },
      } as never);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      roles: [
        {
          role: {
            permissions: [
              { permission: { key: 'audit_log.view' } },
              { permission: { key: 'audit_log.export' } },
            ],
          },
        },
      ],
    } as never);
    const write = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1);

    const result = await service.export(
      'actor',
      ['audit_log.view', 'audit_log.export'],
      {
        domain: 'ORDER',
        page: 1,
        pageSize: 25,
        preset: 'LAST_30_DAYS',
        search: '=must-not-enter-metadata',
        sortDirection: 'desc',
      },
      'request-id',
    );

    expect(list).toHaveBeenCalledTimes(2);
    expect(result.rowCount).toBe(2);
    expect(result.csv).toContain("'=Unsafe actor");
    expect(result.csv).toContain("'+Unsafe summary");
    expect(write).toHaveBeenCalledOnce();
    const serializedWrite = JSON.stringify(write.mock.calls);
    expect(serializedWrite).toContain('AUDIT_EXPORT_GENERATED');
    expect(serializedWrite).toContain('ORDER');
    expect(serializedWrite).not.toContain('must-not-enter-metadata');
  });

  it('fails closed when export permission is revoked during page collection', async () => {
    const service = new AuditService();
    vi.spyOn(service, 'list')
      .mockResolvedValueOnce({
        items: [
          {
            action: 'UPDATED',
            actor: null,
            domain: 'PRODUCT',
            entity: null,
            id: 'one',
            occurredAt: '2026-08-01T00:00:00.000Z',
            source: 'PLATFORM',
            summary: 'First page',
          },
        ],
        meta: { page: 1, pageSize: 100, total: 2, totalPages: 2 },
        range: {
          endDate: '2026-08-08',
          startDate: '2026-08-01',
          timeZone: 'Africa/Accra',
        },
      } as never)
      .mockResolvedValueOnce({
        items: [
          {
            action: 'CREATED',
            actor: null,
            domain: 'ORDER',
            entity: null,
            id: 'two',
            occurredAt: '2026-08-02T00:00:00.000Z',
            source: 'PLATFORM',
            summary: 'Second page',
          },
        ],
        meta: { page: 2, pageSize: 100, total: 2, totalPages: 2 },
        range: {
          endDate: '2026-08-08',
          startDate: '2026-08-01',
          timeZone: 'Africa/Accra',
        },
      } as never);
    vi.spyOn(prisma.user, 'findFirst')
      .mockResolvedValueOnce({
        roles: [
          {
            role: {
              permissions: [
                { permission: { key: 'audit_log.view' } },
                { permission: { key: 'audit_log.export' } },
              ],
            },
          },
        ],
      } as never)
      .mockResolvedValueOnce({ roles: [] } as never);
    const write = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1);

    await expect(
      service.export('actor', ['audit_log.view', 'audit_log.export'], {
        page: 1,
        pageSize: 25,
        preset: 'LAST_30_DAYS',
        sortDirection: 'desc',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(write).not.toHaveBeenCalled();
  });
});
