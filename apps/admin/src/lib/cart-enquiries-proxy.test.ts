import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyCartEnquiries } from './cart-enquiries-proxy';

describe('fixed Admin cart enquiry proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects arbitrary paths, methods, and query keys', async () => {
    const fetcher = vi.fn();
    const path = await proxyCartEnquiries(
      new Request('http://localhost:3001/api/cart-enquiries/export'),
      ['export'],
      fetcher,
    );
    expect(path.status).toBe(404);

    const method = await proxyCartEnquiries(
      new Request('http://localhost:3001/api/cart-enquiries', {
        method: 'DELETE',
      }),
      [],
      fetcher,
    );
    expect(method.status).toBe(404);

    const query = await proxyCartEnquiries(
      new Request('http://localhost:3001/api/cart-enquiries?target=private'),
      [],
      fetcher,
    );
    expect(query.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only the named staff cookie and allowlisted filters', async () => {
    vi.stubEnv('STAFF_SESSION_COOKIE_NAME', 'staff_session');
    const fetcher = vi.fn(async () =>
      Response.json({
        items: [],
        meta: { page: 2, pageSize: 25, total: 0, totalPages: 0 },
      }),
    );
    await proxyCartEnquiries(
      new Request(
        'http://localhost:3001/api/cart-enquiries?page=2&pageSize=25&status=NEW&deliveryStatus=FAILED&search=Ayo',
        {
          headers: {
            Cookie: 'other=private; staff_session=opaque; extra=secret',
          },
        },
      ),
      [],
      fetcher as typeof fetch,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'http://127.0.0.1:4000/admin/cart-enquiries?page=2&pageSize=25&status=NEW&deliveryStatus=FAILED&search=Ayo',
    );
    expect(new Headers(init.headers).get('cookie')).toBe(
      'staff_session=opaque',
    );
    expect(JSON.stringify(init)).not.toMatch(/other=private|extra=secret/);
  });

  it('allows only exact detail, status, and retry routes', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const id = 'cm00000000000000000000000';
    const detail = await proxyCartEnquiries(
      new Request(`http://localhost:3001/api/cart-enquiries/${id}`),
      [id],
      fetcher as typeof fetch,
    );
    expect(detail.status).toBe(200);

    const malformed = await proxyCartEnquiries(
      new Request('http://localhost:3001/api/cart-enquiries/not-an-id'),
      ['not-an-id'],
      fetcher as typeof fetch,
    );
    expect(malformed.status).toBe(404);

    const nestedQuery = await proxyCartEnquiries(
      new Request(
        `http://localhost:3001/api/cart-enquiries/${id}?include=secrets`,
      ),
      [id],
      fetcher as typeof fetch,
    );
    expect(nestedQuery.status).toBe(400);
  });

  it('requires the exact admin origin and JSON content type for mutations', async () => {
    const fetcher = vi.fn();
    const id = 'cm00000000000000000000000';
    const wrongOrigin = await proxyCartEnquiries(
      new Request(`http://localhost:3001/api/cart-enquiries/${id}/status`, {
        body: '{}',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        method: 'PUT',
      }),
      [id, 'status'],
      fetcher,
    );
    expect(wrongOrigin.status).toBe(403);

    const wrongType = await proxyCartEnquiries(
      new Request(
        `http://localhost:3001/api/cart-enquiries/${id}/email/retry`,
        {
          body: '{}',
          headers: {
            'Content-Type': 'text/plain',
            Origin: 'http://localhost:3001',
          },
          method: 'POST',
        },
      ),
      [id, 'email', 'retry'],
      fetcher,
    );
    expect(wrongType.status).toBe(415);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards valid mutations with the trusted upstream origin', async () => {
    vi.stubEnv('ADMIN_ORIGIN', 'https://admin.example.test');
    const fetcher = vi.fn(async () => Response.json({ updated: true }));
    const id = 'cm00000000000000000000000';
    const response = await proxyCartEnquiries(
      new Request(
        `https://admin.example.test/api/cart-enquiries/${id}/email/retry`,
        {
          body: JSON.stringify({ operationId: crypto.randomUUID() }),
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://admin.example.test',
          },
          method: 'POST',
        },
      ),
      [id, 'email', 'retry'],
      fetcher as typeof fetch,
    );
    expect(response.status).toBe(200);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `http://127.0.0.1:4000/admin/cart-enquiries/${id}/email/retry`,
    );
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('origin')).toBe(
      'https://admin.example.test',
    );
  });
});
