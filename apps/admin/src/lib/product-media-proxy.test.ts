import { beforeEach, describe, expect, it, vi } from 'vitest';

import { proxyProductMedia } from './product-media-proxy';

beforeEach(() => {
  process.env.ADMIN_ORIGIN = 'http://localhost:3001';
  process.env.API_INTERNAL_URL = 'http://localhost:4000';
  process.env.STAFF_SESSION_COOKIE_NAME = 'mensah_staff_session';
});

describe('product media BFF', () => {
  it('rejects foreign origins and non-multipart uploads', async () => {
    const foreign = new Request(
      'http://localhost:3001/api/catalogue/products/id/images',
      { method: 'POST', headers: { Origin: 'https://evil.test' } },
    );
    expect(
      (await proxyProductMedia(foreign, 'productid', undefined, vi.fn()))
        .status,
    ).toBe(403);
    const json = new Request(
      'http://localhost:3001/api/catalogue/products/id/images',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3001',
          'Content-Type': 'application/json',
        },
      },
    );
    expect(
      (await proxyProductMedia(json, 'productid', undefined, vi.fn())).status,
    ).toBe(415);
  });

  it('narrows cookies and preserves only the multipart boundary', async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('cookie')).toBe('mensah_staff_session=good');
        expect(headers.get('content-type')).toContain(
          'multipart/form-data; boundary=',
        );
        expect(headers.get('origin')).toBe('http://localhost:3001');
        return Response.json({ id: 'image' });
      },
    );
    const form = new FormData();
    form.set('altText', 'Chair');
    form.set('file', new Blob(['image'], { type: 'image/webp' }), 'chair.webp');
    const request = new Request(
      'http://localhost:3001/api/catalogue/products/id/images',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3001',
          Cookie: 'other=bad; mensah_staff_session=good',
        },
        body: form,
      },
    );
    expect(
      (await proxyProductMedia(request, 'productid', undefined, fetcher))
        .status,
    ).toBe(200);
  });

  it('rejects an oversized multipart request before forwarding it', async () => {
    const request = new Request(
      'http://localhost:3001/api/catalogue/products/id/images',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3001',
          'Content-Type': 'multipart/form-data; boundary=test',
          'Content-Length': String(11 * 1024 * 1024),
        },
        body: 'small-body-with-a-falsified-length',
      },
    );
    const fetcher = vi.fn();
    expect(
      (await proxyProductMedia(request, 'productid', undefined, fetcher))
        .status,
    ).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
