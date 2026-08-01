import { describe, expect, it, vi } from 'vitest';

import { proxyHomepage } from './homepage-proxy';

describe('fixed homepage BFF proxy', () => {
  it('rejects unlisted paths and foreign mutation origins', async () => {
    const fetcher = vi.fn();
    expect(
      (
        await proxyHomepage(
          new Request('http://localhost:3001/api/homepage/arbitrary'),
          ['arbitrary'],
          fetcher,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyHomepage(
          new Request('http://localhost:3001/api/homepage/drafts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'https://evil.example',
            },
            body: '{}',
          }),
          ['drafts'],
          fetcher,
        )
      ).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires an exact JSON media type for JSON mutations', async () => {
    const response = await proxyHomepage(
      new Request('http://localhost:3001/api/homepage/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json-evil',
          Origin: 'http://localhost:3001',
        },
        body: '{}',
      }),
      ['drafts'],
      vi.fn(),
    );
    expect(response.status).toBe(415);
  });

  it('forwards only allowlisted media-library query keys and the staff cookie', async () => {
    const fetcher = vi.fn(async () => Response.json({ items: [] }));
    await proxyHomepage(
      new Request(
        'http://localhost:3001/api/homepage/media/library?search=chair&page=2&source=PRODUCT&target=https://evil.example',
        {
          headers: {
            Cookie: 'other=secret; mensah_staff_session=opaque',
          },
        },
      ),
      ['media', 'library'],
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'http://localhost:4000/admin/homepage/media/library?search=chair&page=2&source=PRODUCT',
    );
    expect(new Headers(init.headers).get('Cookie')).toBe(
      'mensah_staff_session=opaque',
    );
  });
});
