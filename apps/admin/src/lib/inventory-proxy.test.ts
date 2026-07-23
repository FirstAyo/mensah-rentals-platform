import { beforeEach, describe, expect, it, vi } from 'vitest';

import { proxyInventory } from './inventory-proxy';

beforeEach(() => {
  process.env.ADMIN_ORIGIN = 'http://localhost:3001';
  process.env.API_INTERNAL_URL = 'http://localhost:4000';
  process.env.STAFF_SESSION_COOKIE_NAME = 'mensah_staff_session';
});

describe('inventory BFF', () => {
  it('rejects unallowlisted paths and foreign mutation origins', async () => {
    expect(
      (
        await proxyInventory(
          new Request('http://localhost:3001/api/inventory/secrets/private'),
          ['secrets', 'private'],
          vi.fn(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyInventory(
          new Request('http://localhost:3001/api/inventory', {
            method: 'POST',
            headers: { Origin: 'https://evil.test' },
          }),
          [],
          vi.fn(),
        )
      ).status,
    ).toBe(403);
  });

  it('forwards only the named cookie and allowlisted query', async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('cookie')).toBe('mensah_staff_session=good');
        return Response.json({ items: [] });
      },
    );
    await proxyInventory(
      new Request('http://localhost:3001/api/inventory?page=1&secret=x', {
        headers: { Cookie: 'other=bad; mensah_staff_session=good' },
      }),
      [],
      fetcher,
    );
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'http://localhost:4000/admin/inventory?page=1',
    );
  });
});
