import { describe, expect, it, vi } from 'vitest';

import { proxyAuthMe, proxyAuthPost } from './auth-proxy';

describe('fixed admin authentication proxy', () => {
  it('rejects a foreign Origin before calling the API', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await proxyAuthPost(
      new Request('http://localhost:3001/api/auth/login', {
        body: '{}',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://attacker.invalid',
        },
        method: 'POST',
      }),
      '/auth/login',
      fetcher,
    );

    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('relays the login cookie and overwrites the upstream Origin', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'staff-id' } }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie':
            'mensah_staff_session=opaque; Path=/; HttpOnly; SameSite=Lax',
        },
      }),
    );
    const response = await proxyAuthPost(
      new Request('http://localhost:3001/api/auth/login', {
        body: '{}',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3001',
        },
        method: 'POST',
      }),
      '/auth/login',
      fetcher,
    );

    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:4000/auth/login',
      expect.objectContaining({
        headers: expect.any(Headers),
        method: 'POST',
      }),
    );
    const upstreamHeaders = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(upstreamHeaders.get('origin')).toBe('http://localhost:3001');
  });

  it('forwards the staff cookie for current-user validation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ user: { id: 'staff-id' } }));
    await proxyAuthMe(
      new Request('http://localhost:3001/api/auth/me', {
        headers: { Cookie: 'mensah_staff_session=opaque' },
      }),
      fetcher,
    );

    const upstreamHeaders = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(upstreamHeaders.get('cookie')).toBe('mensah_staff_session=opaque');
  });
});
