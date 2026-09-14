import { describe, expect, it, vi } from 'vitest';

import { proxyGallery } from './gallery-proxy';

describe('fixed Gallery BFF proxy', () => {
  it('rejects arbitrary routes and query keys', async () => {
    expect(
      (
        await proxyGallery(
          new Request('http://localhost:3001/api/gallery/arbitrary'),
          ['arbitrary'],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyGallery(
          new Request('http://localhost:3001/api/gallery?target=evil'),
          [],
        )
      ).status,
    ).toBe(400);
  });

  it('forwards only the staff cookie and allowlisted list filters', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        items: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    );
    await proxyGallery(
      new Request(
        'http://localhost:3001/api/gallery?page=1&serviceType=FILM_PRODUCTION',
        { headers: { cookie: 'mensah_staff_session=safe; unrelated=no' } },
      ),
      [],
      fetcher as typeof fetch,
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      'http://127.0.0.1:4000/admin/gallery/projects?page=1&serviceType=FILM_PRODUCTION',
    );
    expect(new Headers(init?.headers).get('cookie')).toBe(
      'mensah_staff_session=safe',
    );
  });

  it('requires exact origin and JSON for mutations', async () => {
    const missingOrigin = await proxyGallery(
      new Request('http://localhost:3001/api/gallery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      [],
    );
    expect(missingOrigin.status).toBe(403);
    const wrongType = await proxyGallery(
      new Request('http://localhost:3001/api/gallery', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3001',
          'content-type': 'text/plain',
        },
        body: '{}',
      }),
      [],
    );
    expect(wrongType.status).toBe(415);
  });

  it('allowlists the protected unpublish mutation and rejects other actions', async () => {
    const id = 'cm00000000000000000000000';
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id, published: false }),
    );
    const response = await proxyGallery(
      new Request(`http://localhost:3001/api/gallery/${id}/unpublish`, {
        method: 'POST',
        headers: {
          cookie: 'mensah_staff_session=safe',
          origin: 'http://localhost:3001',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          expectedLockVersion: 2,
          operationId: 'fa40e80b-b72c-4d4c-ad4f-4489bd6136a1',
        }),
      }),
      [id, 'unpublish'],
      fetcher as typeof fetch,
    );
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/admin/gallery/projects/${id}/unpublish`,
    );

    expect(
      (
        await proxyGallery(
          new Request(`http://localhost:3001/api/gallery/${id}/delete`, {
            method: 'POST',
            headers: {
              origin: 'http://localhost:3001',
              'content-type': 'application/json',
            },
            body: '{}',
          }),
          [id, 'delete'],
        )
      ).status,
    ).toBe(404);
  });

  it('allowlists only the explicit atomic publish routes', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id: 'project-id', published: true }),
    );
    const request = new Request('http://localhost:3001/api/gallery/publish', {
      method: 'POST',
      headers: {
        cookie: 'mensah_staff_session=safe',
        origin: 'http://localhost:3001',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(
      (await proxyGallery(request, ['publish'], fetcher as typeof fetch))
        .status,
    ).toBe(200);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:4000/admin/gallery/projects/publish',
    );
  });
});
