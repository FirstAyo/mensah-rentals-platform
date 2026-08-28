import { describe, expect, it, vi } from 'vitest';

import { proxyPublicPages } from './public-pages-proxy';

describe('fixed public-pages BFF proxy', () => {
  it('rejects arbitrary paths and foreign mutation origins', async () => {
    const fetcher = vi.fn();
    expect(
      (
        await proxyPublicPages(
          new Request('http://localhost:3001/api/public-pages/arbitrary'),
          ['arbitrary'],
          fetcher,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyPublicPages(
          new Request('http://localhost:3001/api/public-pages/ABOUT/draft', {
            method: 'PUT',
            headers: {
              Origin: 'https://evil.example',
              'Content-Type': 'application/json',
            },
            body: '{}',
          }),
          ['ABOUT', 'draft'],
          fetcher,
        )
      ).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires exact JSON and bounds request bodies', async () => {
    const response = await proxyPublicPages(
      new Request('http://localhost:3001/api/public-pages/ABOUT/draft', {
        method: 'PUT',
        headers: {
          Origin: 'http://localhost:3001',
          'Content-Type': 'text/plain',
        },
        body: '{}',
      }),
      ['ABOUT', 'draft'],
      vi.fn(),
    );
    expect(response.status).toBe(415);
  });

  it('forwards only allowlisted media-library query keys', async () => {
    const fetcher = vi.fn(async () => Response.json({ items: [] }));
    await proxyPublicPages(
      new Request(
        'http://localhost:3001/api/public-pages/media/library?search=chairs&page=2&source=PRODUCT&target=https://evil.example',
        { headers: { Cookie: 'mensah_staff_session=opaque' } },
      ),
      ['media', 'library'],
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'http://127.0.0.1:4000/admin/public-pages-media/library?search=chairs&page=2&source=PRODUCT',
    );
    expect(new Headers(init.headers).get('Cookie')).toBe(
      'mensah_staff_session=opaque',
    );
  });
});
