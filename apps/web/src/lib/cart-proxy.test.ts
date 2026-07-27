import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyCart } from './cart-proxy';

describe('fixed public cart BFF proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects foreign mutation origins and non-JSON bodies', async () => {
    const fetcher = vi.fn();
    const foreign = await proxyCart(
      new Request('http://localhost:3000/api/cart/items/chair', {
        method: 'PUT',
        headers: {
          Origin: 'https://evil.example',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      ['items', 'chair'],
      fetcher,
    );
    expect(foreign.status).toBe(403);
    const plain = await proxyCart(
      new Request('http://localhost:3000/api/cart/items/chair', {
        method: 'PUT',
        headers: { Origin: 'http://localhost:3000' },
        body: '{}',
      }),
      ['items', 'chair'],
      fetcher,
    );
    expect(plain.status).toBe(415);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces the body limit in encoded bytes', async () => {
    const fetcher = vi.fn();
    const response = await proxyCart(
      new Request('http://localhost:3000/api/cart/items/chair', {
        method: 'PUT',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: 'é'.repeat(600),
      }),
      ['items', 'chair'],
      fetcher,
    );
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only the named opaque cart token to a fixed upstream path', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ desiredUnitCount: 0, distinctItemCount: 0, items: [] }),
    );
    await proxyCart(
      new Request('http://localhost:3000/api/cart', {
        headers: {
          Cookie: `other=secret; mensah_rental_cart=${'a'.repeat(43)}; staff=private`,
        },
      }),
      [],
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://localhost:4000/public/cart');
    const headers = new Headers(init.headers);
    expect(headers.get('x-rental-cart-token')).toBe('a'.repeat(43));
    expect(headers.get('cookie')).toBeNull();
    expect(JSON.stringify(init)).not.toContain('secret');
    expect(JSON.stringify(init)).not.toContain('private');
  });

  it('stores an upstream capability in an HttpOnly same-site cookie without exposing it in JSON', async () => {
    const token = 'b'.repeat(43);
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            desiredUnitCount: 100,
            distinctItemCount: 1,
            items: [],
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-rental-cart-token': token,
            },
          },
        ),
    );
    const response = await proxyCart(
      new Request('http://localhost:3000/api/cart/items/chair', {
        method: 'PUT',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ desiredQuantity: 100 }),
      }),
      ['items', 'chair'],
      fetcher,
    );
    expect(response.headers.get('set-cookie')).toMatch(
      /mensah_rental_cart=.*HttpOnly.*SameSite=lax/i,
    );
    expect(await response.text()).not.toContain(token);
  });

  it('does not act as a generic upstream proxy', async () => {
    const fetcher = vi.fn();
    const response = await proxyCart(
      new Request('http://localhost:3000/api/cart/admin/users'),
      ['admin', 'users'],
      fetcher,
    );
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed before an unsafe successful response reaches the browser', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        desiredUnitCount: 0,
        distinctItemCount: 0,
        items: [],
        nested: { availableQuantity: 12, passwordHash: 'private' },
      }),
    );
    const response = await proxyCart(
      new Request('http://localhost:3000/api/cart'),
      [],
      fetcher,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(
      /availableQuantity|passwordHash|12/,
    );
  });

  it('maps unsafe upstream errors to a known public message', async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { message: 'availableQuantity=12 tokenHash=private' },
        { status: 409 },
      ),
    );
    const response = await proxyCart(
      new Request('http://localhost:3000/api/cart'),
      [],
      fetcher,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'The rental cart changed. Refresh the page and try again.',
    });
  });
});
