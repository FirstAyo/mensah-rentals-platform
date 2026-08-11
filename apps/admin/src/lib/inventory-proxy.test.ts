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

  it('allows only the explicit inventory-management routes and methods', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const mutation = (path: string, method: string) =>
      proxyInventory(
        new Request(`http://localhost:3001/api/inventory/${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3001',
          },
          body: method === 'GET' ? undefined : '{}',
        }),
        path.split('/'),
        fetcher,
      );

    expect((await mutation('abc123', 'PATCH')).status).toBe(200);
    expect((await mutation('abc123', 'DELETE')).status).toBe(200);
    expect((await mutation('abc123/lifecycle', 'GET')).status).toBe(200);
    expect((await mutation('abc123/stock-additions', 'POST')).status).toBe(200);
    expect((await mutation('abc123/stock-reductions', 'POST')).status).toBe(
      200,
    );
    expect((await mutation('abc123/archive', 'POST')).status).toBe(200);
    expect((await mutation('abc123/restore', 'POST')).status).toBe(200);
    expect((await mutation('abc123/archive', 'DELETE')).status).toBe(404);
  });

  it('requires bounded JSON bodies for mutations', async () => {
    const fetcher = vi.fn();
    const request = (contentType: string, body: string) =>
      proxyInventory(
        new Request('http://localhost:3001/api/inventory/abc123', {
          method: 'PATCH',
          headers: {
            'Content-Type': contentType,
            Origin: 'http://localhost:3001',
          },
          body,
        }),
        ['abc123'],
        fetcher,
      );
    expect((await request('text/plain', '{}')).status).toBe(415);
    expect(
      (await request('application/json', 'x'.repeat(16 * 1024 + 1))).status,
    ).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards the lifecycle filter but strips unrelated list data', async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        void url;
        void init;
        return Response.json({ items: [] });
      },
    );
    await proxyInventory(
      new Request(
        'http://localhost:3001/api/inventory?lifecycle=ARCHIVED&internalNotes=secret',
      ),
      [],
      fetcher,
    );
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'http://localhost:4000/admin/inventory?lifecycle=ARCHIVED',
    );
  });
});
