import { describe, expect, it, vi } from 'vitest';
import { proxyMaintenance } from './maintenance-proxy';

describe('maintenance fixed BFF', () => {
  it('rejects unknown routes and foreign mutation origins', async () => {
    expect(
      (
        await proxyMaintenance(
          new Request('http://localhost:3001/api/maintenance/secrets'),
          ['secrets'],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyMaintenance(
          new Request(
            'http://localhost:3001/api/maintenance/work-orders/example/start',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Origin: 'https://attacker.invalid',
              },
              body: '{}',
            },
          ),
          ['work-orders', 'example', 'start'],
        )
      ).status,
    ).toBe(403);
  });

  it('requires JSON and limits mutation bodies', async () => {
    const path = ['work-orders'];
    expect(
      (
        await proxyMaintenance(
          new Request('http://localhost:3001/api/maintenance/work-orders', {
            method: 'POST',
            headers: { Origin: 'http://localhost:3001' },
          }),
          path,
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await proxyMaintenance(
          new Request('http://localhost:3001/api/maintenance/work-orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': String(65 * 1024),
              Origin: 'http://localhost:3001',
            },
            body: '{}',
          }),
          path,
        )
      ).status,
    ).toBe(413);
  });

  it('forwards only the named cookie and allowlisted query keys', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) =>
      Response.json({ cookie: new Headers(init?.headers).get('cookie'), url }),
    );
    const response = await proxyMaintenance(
      new Request(
        'http://localhost:3001/api/maintenance/work-orders?page=2&priority=HIGH&internalNotes=true',
        { headers: { Cookie: 'mensah_staff_session=token; unrelated=secret' } },
      ),
      ['work-orders'],
      fetcher as unknown as typeof fetch,
    );
    const body = (await response.json()) as { cookie: string; url: string };
    expect(body.url).toContain('page=2');
    expect(body.url).toContain('priority=HIGH');
    expect(body.url).not.toContain('internalNotes');
    expect(body.cookie).toBe('mensah_staff_session=token');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('allowlists source context reads without allowing source mutations', async () => {
    const fetcher = vi.fn(async () => Response.json({ eligible: true }));
    const path = ['sources', 'issues', 'cm1234567890abcdef'];
    expect(
      (
        await proxyMaintenance(
          new Request(
            'http://localhost:3001/api/maintenance/sources/issues/cm1234567890abcdef',
          ),
          path,
          fetcher as unknown as typeof fetch,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await proxyMaintenance(
          new Request(
            'http://localhost:3001/api/maintenance/sources/issues/cm1234567890abcdef',
            {
              body: '{}',
              headers: {
                'Content-Type': 'application/json',
                Origin: 'http://localhost:3001',
              },
              method: 'POST',
            },
          ),
          path,
          fetcher as unknown as typeof fetch,
        )
      ).status,
    ).toBe(404);
  });
});
