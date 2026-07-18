import { describe, expect, it, vi } from 'vitest';
import { proxyCatalogue } from './catalogue-proxy';
describe('fixed catalogue BFF proxy', () => {
  it('rejects a foreign mutation origin before forwarding', async () => {
    const fetcher = vi.fn();
    const response = await proxyCatalogue(
      new Request('http://localhost:3001/api/catalogue/products', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: '{}',
      }),
      'products',
      '',
      fetcher,
    );
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('forwards only the named session cookie and allowlisted query keys', async () => {
    const fetcher = vi.fn(async () => Response.json({ items: [] }));
    await proxyCatalogue(
      new Request(
        'http://localhost:3001/api/catalogue/products?page=2&upstream=https://evil.example',
        {
          headers: {
            Cookie: 'other=secret; mensah_staff_session=opaque; tracking=value',
          },
        },
      ),
      'products',
      '',
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://localhost:4000/admin/products?page=2');
    expect(new Headers(init.headers).get('Cookie')).toBe(
      'mensah_staff_session=opaque',
    );
    expect(new Headers(init.headers).get('Cookie')).not.toContain('other');
  });
  it('overwrites the upstream Origin on valid mutations', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    await proxyCatalogue(
      new Request('http://localhost:3001/api/catalogue/categories', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3001',
          Cookie: 'mensah_staff_session=opaque',
        },
        body: '{}',
      }),
      'categories',
      '',
      fetcher,
    );
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('Origin')).toBe(
      'http://localhost:3001',
    );
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    );
  });
});
