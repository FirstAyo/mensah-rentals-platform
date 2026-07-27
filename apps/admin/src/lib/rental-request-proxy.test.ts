import { beforeEach, describe, expect, it, vi } from 'vitest';

import { proxyRentalRequest } from './rental-request-proxy';

beforeEach(() => {
  process.env.ADMIN_ORIGIN = 'http://localhost:3001';
  process.env.API_INTERNAL_URL = 'http://localhost:4000';
  process.env.STAFF_SESSION_COOKIE_NAME = 'mensah_staff_session';
});

describe('rental-request BFF', () => {
  it('rejects unallowlisted paths and methods', async () => {
    const fetcher = vi.fn();
    const hidden = await proxyRentalRequest(
      new Request('http://localhost:3001/api/rental-requests/id/secrets'),
      ['id', 'secrets'],
      fetcher,
    );
    const listMutation = await proxyRentalRequest(
      new Request('http://localhost:3001/api/rental-requests', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3001' },
      }),
      [],
      fetcher,
    );

    expect(hidden.status).toBe(404);
    expect(listMutation.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a mutation from a foreign origin', async () => {
    const response = await proxyRentalRequest(
      new Request('http://localhost:3001/api/rental-requests/id/notes', {
        method: 'POST',
        headers: { Origin: 'https://evil.test' },
      }),
      ['id', 'notes'],
      vi.fn(),
    );

    expect(response.status).toBe(403);
  });

  it('rejects non-JSON and oversized mutation bodies', async () => {
    const fetcher = vi.fn();
    const nonJson = await proxyRentalRequest(
      new Request('http://localhost:3001/api/rental-requests/id/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          Origin: 'http://localhost:3001',
        },
        body: 'note',
      }),
      ['id', 'notes'],
      fetcher,
    );
    const oversized = await proxyRentalRequest(
      new Request('http://localhost:3001/api/rental-requests/id/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3001',
        },
        body: JSON.stringify({ body: 'x'.repeat(17 * 1024) }),
      }),
      ['id', 'notes'],
      fetcher,
    );

    expect(nonJson.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only the staff cookie and allowlisted query keys', async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('cookie')).toBe('mensah_staff_session=good');
        expect(headers.has('authorization')).toBe(false);
        return Response.json({ items: [] });
      },
    );

    await proxyRentalRequest(
      new Request(
        'http://localhost:3001/api/rental-requests?page=2&status=SUBMITTED&upstream=https://evil.test&secret=x',
        {
          headers: {
            Authorization: 'Bearer bad',
            Cookie: 'other=bad; mensah_staff_session=good',
          },
        },
      ),
      [],
      fetcher,
    );

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'http://localhost:4000/admin/rental-requests?page=2&status=SUBMITTED',
    );
  });

  it('forwards each explicit detail action and its body', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    for (const [method, path] of [
      ['GET', 'requestid'],
      ['GET', 'requestid/notes'],
      ['POST', 'requestid/notes'],
      ['GET', 'requestid/activity'],
      ['PUT', 'requestid/assignment'],
      ['DELETE', 'requestid/assignment'],
      ['PUT', 'requestid/review-state'],
    ] as const) {
      const response = await proxyRentalRequest(
        new Request(`http://localhost:3001/api/rental-requests/${path}`, {
          method,
          headers:
            method === 'GET'
              ? undefined
              : {
                  'Content-Type': 'application/json',
                  Origin: 'http://localhost:3001',
                },
          body: method === 'GET' ? undefined : JSON.stringify({ value: true }),
        }),
        path.split('/'),
        fetcher,
      );
      expect(response.status).toBe(200);
    }
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it('returns a stable unavailable response when the API cannot be reached', async () => {
    const response = await proxyRentalRequest(
      new Request('http://localhost:3001/api/rental-requests'),
      [],
      vi.fn(async () => {
        throw new Error('private upstream detail');
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Rental request service is unavailable',
    });
  });
});
