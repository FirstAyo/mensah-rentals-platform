import { describe, expect, it, vi } from 'vitest';
import { proxySystemStatus } from './system-proxy';

describe('system status fixed BFF', () => {
  it('allows only fixed read-only status routes without queries', async () => {
    expect(
      (
        await proxySystemStatus(
          new Request('http://localhost:3001/api/system/secrets'),
          ['secrets'],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxySystemStatus(
          new Request('http://localhost:3001/api/system/status?path=.env'),
          ['status'],
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await proxySystemStatus(
          new Request('http://localhost:3001/api/system/status', {
            method: 'POST',
          }),
          ['status'],
        )
      ).status,
    ).toBe(404);
  });

  it('forwards the named cookie and rejects unsafe MIME', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        generatedAt: '2026-08-08T00:00:00.000Z',
        environment: 'test',
        api: { status: 'ok', uptimeSeconds: 1, version: null, commit: null },
        database: {
          status: 'ok',
          migrations: {
            applied: 48,
            expected: 48,
            failed: 0,
            upToDate: true,
          },
        },
        media: { status: 'writable' },
        integrations: { googleReviews: { configured: false } },
      }),
    );
    const safe = await proxySystemStatus(
      new Request('http://localhost:3001/api/system/status', {
        headers: { Cookie: 'mensah_staff_session=safe; other=secret' },
      }),
      ['status'],
      fetcher as unknown as typeof fetch,
    );
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('cookie')).toBe(
      'mensah_staff_session=safe',
    );
    expect(safe.status).toBe(200);
    const unsafe = await proxySystemStatus(
      new Request('http://localhost:3001/api/system/status'),
      ['status'],
      vi.fn(
        async () =>
          new Response('stack', { headers: { 'Content-Type': 'text/plain' } }),
      ) as unknown as typeof fetch,
    );
    expect(unsafe.status).toBe(502);
    expect(await unsafe.text()).not.toContain('stack');
  });
});
