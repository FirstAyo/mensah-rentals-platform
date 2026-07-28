import { describe, expect, it, vi } from 'vitest';

import { proxyOrder } from './order-proxy';

describe('admin rental order BFF', () => {
  it('allows only fixed list and detail GET routes', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await proxyOrder(
      new Request('http://localhost:3001/api/orders/order-id/reserve', {
        method: 'POST',
      }),
      ['order-id', 'reserve'],
      fetcher,
    );
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows only the explicit reservation action routes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: 'RESERVED' }));
    const headers = {
      'content-type': 'application/json',
      origin: 'http://localhost:3001',
    };
    const create = await proxyOrder(
      new Request('http://localhost:3001/api/orders/order1/reservations', {
        body: JSON.stringify({ operationId: crypto.randomUUID() }),
        headers,
        method: 'POST',
      }),
      ['order1', 'reservations'],
      fetcher,
    );
    const complete = await proxyOrder(
      new Request(
        'http://localhost:3001/api/orders/order1/reservations/res1/complete',
        {
          body: JSON.stringify({ operationId: crypto.randomUUID() }),
          headers,
          method: 'POST',
        },
      ),
      ['order1', 'reservations', 'res1', 'complete'],
      fetcher,
    );
    const unknown = await proxyOrder(
      new Request(
        'http://localhost:3001/api/orders/order1/reservations/res1/checkout',
        { body: '{}', headers, method: 'POST' },
      ),
      ['order1', 'reservations', 'res1', 'checkout'],
      fetcher,
    );
    expect(create.status).toBe(200);
    expect(complete.status).toBe(200);
    expect(unknown.status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('forwards only the eligible-assets query parameter', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ items: [] }));
    await proxyOrder(
      new Request(
        'http://localhost:3001/api/orders/order1/reservations/res1/eligible-assets?rentalOrderItemId=item1&availableQuantity=999',
      ),
      ['order1', 'reservations', 'res1', 'eligible-assets'],
      fetcher,
    );
    const [url] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('rentalOrderItemId=item1');
    expect(String(url)).not.toContain('availableQuantity');
  });

  it('allows the order-level eligible-assets selector before initial reservation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ items: [] }));
    const response = await proxyOrder(
      new Request(
        'http://localhost:3001/api/orders/order1/eligible-assets?rentalOrderItemId=item1',
      ),
      ['order1', 'eligible-assets'],
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('enforces exact origin, JSON content, and bounded bodies for reservation mutations', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const wrongOrigin = await proxyOrder(
      new Request('http://localhost:3001/api/orders/order1/reservations', {
        body: '{}',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.invalid',
        },
        method: 'POST',
      }),
      ['order1', 'reservations'],
      fetcher,
    );
    const wrongType = await proxyOrder(
      new Request('http://localhost:3001/api/orders/order1/reservations', {
        body: '{}',
        headers: {
          'content-type': 'text/plain',
          origin: 'http://localhost:3001',
        },
        method: 'POST',
      }),
      ['order1', 'reservations'],
      fetcher,
    );
    const tooLarge = await proxyOrder(
      new Request('http://localhost:3001/api/orders/order1/reservations', {
        body: 'x'.repeat(32 * 1024 + 1),
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3001',
        },
        method: 'POST',
      }),
      ['order1', 'reservations'],
      fetcher,
    );
    expect(wrongOrigin.status).toBe(403);
    expect(wrongType.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared body before reading it', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await proxyOrder(
      new Request('http://localhost:3001/api/orders/order1/reservations', {
        body: '{}',
        headers: {
          'content-length': String(32 * 1024 + 1),
          'content-type': 'application/json',
          origin: 'http://localhost:3001',
        },
        method: 'POST',
      }),
      ['order1', 'reservations'],
      fetcher,
    );
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only allowlisted query keys and the staff cookie', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ items: [], meta: {} }));
    await proxyOrder(
      new Request(
        'http://localhost:3001/api/orders?page=2&status=CONFIRMED&inventoryQuantity=99',
        { headers: { cookie: 'mensah_staff_session=safe; unrelated=drop' } },
      ),
      [],
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('page=2');
    expect(String(url)).toContain('status=CONFIRMED');
    expect(String(url)).not.toContain('inventoryQuantity');
    expect(new Headers(init?.headers).get('cookie')).toBe(
      'mensah_staff_session=safe',
    );
  });

  it('returns a stable unavailable response when the API cannot be reached', async () => {
    const response = await proxyOrder(
      new Request('http://localhost:3001/api/orders'),
      [],
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Rental order service is unavailable',
    });
  });

  it('preserves a safe order-number PDF filename', async () => {
    const response = await proxyOrder(
      new Request('http://localhost:3001/api/orders/orderid/pdf', {
        headers: { cookie: 'mensah_staff_session=safe' },
      }),
      ['orderid', 'pdf'],
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('%PDF-1.4', {
          headers: {
            'Content-Disposition':
              'attachment; filename="mensah-rentals-order-RO-2026-0001.pdf"',
            'Content-Type': 'application/pdf',
          },
        }),
      ),
    );
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="mensah-rentals-order-RO-2026-0001.pdf"',
    );
  });
});
