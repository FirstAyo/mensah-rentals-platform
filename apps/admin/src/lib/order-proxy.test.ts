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
