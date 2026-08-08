import { describe, expect, it, vi } from 'vitest';
import { proxyReporting } from './reporting-proxy';

describe('reporting fixed BFF', () => {
  it('rejects unknown paths, methods and query keys', async () => {
    expect(
      (
        await proxyReporting(
          new Request('http://localhost:3001/api/reports/secrets'),
          ['secrets'],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyReporting(
          new Request(
            'http://localhost:3001/api/reports/overview?databaseUrl=true',
          ),
          ['overview'],
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await proxyReporting(
          new Request('http://localhost:3001/api/reports/overview', {
            method: 'POST',
          }),
          ['overview'],
        )
      ).status,
    ).toBe(404);
  });

  it('requires same-origin JSON for audited exports', async () => {
    const path = ['rental-requests', 'export'];
    expect(
      (
        await proxyReporting(
          new Request(
            'http://localhost:3001/api/reports/rental-requests/export',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Origin: 'https://attacker.invalid',
              },
              body: '{}',
            },
          ),
          path,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await proxyReporting(
          new Request(
            'http://localhost:3001/api/reports/rental-requests/export',
            {
              method: 'POST',
              headers: { Origin: 'http://localhost:3001' },
              body: '{}',
            },
          ),
          path,
        )
      ).status,
    ).toBe(415);
  });

  it('forwards only the named cookie and safe query', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        range: {
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          timeZone: 'Africa/Accra',
        },
        metrics: [],
        series: [],
        items: [],
        meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      }),
    );
    const response = await proxyReporting(
      new Request(
        'http://localhost:3001/api/reports/inventory?preset=LAST_30_DAYS&pageSize=25',
        { headers: { Cookie: 'mensah_staff_session=token; unrelated=secret' } },
      ),
      ['inventory'],
      fetcher as unknown as typeof fetch,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('preset=LAST_30_DAYS');
    expect(url).toContain('pageSize=25');
    expect(new Headers(init.headers).get('cookie')).toBe(
      'mensah_staff_session=token',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects unsafe export MIME and sanitizes filenames', async () => {
    const request = new Request(
      'http://localhost:3001/api/reports/inventory/export',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3001',
        },
        body: '{}',
      },
    );
    const unsafe = await proxyReporting(
      request.clone(),
      ['inventory', 'export'],
      vi.fn(
        async () =>
          new Response('<html>bad</html>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      ) as unknown as typeof fetch,
    );
    expect(unsafe.status).toBe(502);
    const safe = await proxyReporting(
      request,
      ['inventory', 'export'],
      vi.fn(
        async () =>
          new Response('Reference\r\nMR-1\r\n', {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="../../secrets.csv"',
            },
          }),
      ) as unknown as typeof fetch,
    );
    expect(safe.status).toBe(200);
    expect(safe.headers.get('content-disposition')).toBe(
      'attachment; filename="mensah-rentals-inventory.csv"',
    );
  });
});
