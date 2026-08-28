import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyContactEnquiries } from './contact-enquiries-proxy';

describe('fixed Admin contact enquiry proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects unallowlisted paths and query keys', async () => {
    const fetcher = vi.fn();
    const path = await proxyContactEnquiries(
      new Request('http://localhost:3001/api/contact-enquiries/export'),
      ['export'],
      fetcher,
    );
    expect(path.status).toBe(404);
    const query = await proxyContactEnquiries(
      new Request('http://localhost:3001/api/contact-enquiries?secret=true'),
      [],
      fetcher,
    );
    expect(query.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only the named staff cookie to the exact list endpoint', async () => {
    vi.stubEnv('STAFF_SESSION_COOKIE_NAME', 'staff_session');
    const fetcher = vi.fn(async () =>
      Response.json({
        items: [],
        meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      }),
    );
    await proxyContactEnquiries(
      new Request('http://localhost:3001/api/contact-enquiries?page=1', {
        headers: {
          Cookie: 'other=private; staff_session=opaque; extra=secret',
        },
      }),
      [],
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://127.0.0.1:4000/admin/contact-enquiries?page=1');
    expect(new Headers(init.headers).get('cookie')).toBe(
      'staff_session=opaque',
    );
    expect(JSON.stringify(init)).not.toMatch(/other=private|extra=secret/);
  });

  it('requires same-origin JSON for status mutations', async () => {
    const fetcher = vi.fn();
    const response = await proxyContactEnquiries(
      new Request(
        'http://localhost:3001/api/contact-enquiries/cm00000000000000000000000/status',
        {
          body: '{}',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://evil.example',
          },
          method: 'PUT',
        },
      ),
      ['cm00000000000000000000000', 'status'],
      fetcher,
    );
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
