import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { proxyReturnDomain } from './return-proxy';

describe('return BFF allowlist', () => {
  beforeEach(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://localhost:4000');
    vi.stubEnv('ADMIN_ORIGIN', 'http://localhost:3001');
    vi.stubEnv('STAFF_SESSION_COOKIE_NAME', 'mensah_staff_session');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects arbitrary paths and methods', async () => {
    expect(
      (
        await proxyReturnDomain(
          'returns',
          new Request('http://localhost:3001/api/returns/../../inventory'),
          ['x', 'delete'],
          vi.fn(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyReturnDomain(
          'issues',
          new Request('http://localhost:3001/api/issues', { method: 'DELETE' }),
          [],
          vi.fn(),
        )
      ).status,
    ).toBe(404);
  });

  it('enforces exact origin, JSON, and body size for mutations', async () => {
    const path = ['active', 'cm00000000000000000000000'];
    expect(
      (
        await proxyReturnDomain(
          'returns',
          new Request('http://localhost:3001/api/returns/active/id', {
            method: 'POST',
            headers: {
              Origin: 'https://evil.test',
              'Content-Type': 'application/json',
            },
            body: '{}',
          }),
          path,
          vi.fn(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await proxyReturnDomain(
          'returns',
          new Request('http://localhost:3001/api/returns/active/id', {
            method: 'POST',
            headers: {
              Origin: 'http://localhost:3001',
              'Content-Type': 'text/plain',
            },
            body: '{}',
          }),
          path,
          vi.fn(),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await proxyReturnDomain(
          'returns',
          new Request('http://localhost:3001/api/returns/active/id', {
            method: 'POST',
            headers: {
              Origin: 'http://localhost:3001',
              'Content-Type': 'application/json',
              'Content-Length': String(65 * 1024),
            },
            body: '{}',
          }),
          path,
          vi.fn(),
        )
      ).status,
    ).toBe(413);
  });

  it('forwards only the staff cookie and rejects unsafe PDF MIME', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('cookie')).toBe(
        'mensah_staff_session=secret',
      );
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const response = await proxyReturnDomain(
      'returns',
      new Request(
        'http://localhost:3001/api/returns/cm00000000000000000000000/receipt-pdf',
        {
          headers: {
            Cookie: 'other=leak; mensah_staff_session=secret; tracking=x',
          },
        },
      ),
      ['cm00000000000000000000000', 'receipt-pdf'],
      fetcher as typeof fetch,
    );
    expect(response.status).toBe(502);
  });
});
