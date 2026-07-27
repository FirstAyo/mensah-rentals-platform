import { describe, expect, it, vi } from 'vitest';

import { proxyQuote } from './quote-proxy';

describe('admin quote BFF', () => {
  it('uses a fixed allowlist', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await proxyQuote(
      new Request('http://localhost:3001/api/quotes/a/delete', {
        method: 'DELETE',
      }),
      ['a', 'delete'],
      fetcher,
    );
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires exact origin and JSON for mutations', async () => {
    const wrongOrigin = await proxyQuote(
      new Request(
        'http://localhost:3001/api/quotes/request/cm00000000000000000000000',
        {
          method: 'POST',
          headers: {
            origin: 'https://evil.test',
            'content-type': 'application/json',
          },
          body: '{}',
        },
      ),
      ['request', 'cm00000000000000000000000'],
    );
    expect(wrongOrigin.status).toBe(403);
    const wrongType = await proxyQuote(
      new Request(
        'http://localhost:3001/api/quotes/request/cm00000000000000000000000',
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3001',
            'content-type': 'text/plain',
          },
          body: '{}',
        },
      ),
      ['request', 'cm00000000000000000000000'],
    );
    expect(wrongType.status).toBe(415);
  });

  it('rejects oversized declared and encoded bodies before proxying', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const url =
      'http://localhost:3001/api/quotes/request/cm00000000000000000000000';
    const headers = {
      origin: 'http://localhost:3001',
      'content-type': 'application/json',
    };
    const declared = await proxyQuote(
      new Request(url, {
        method: 'POST',
        headers: { ...headers, 'content-length': String(64 * 1024 + 1) },
        body: '{}',
      }),
      ['request', 'cm00000000000000000000000'],
      fetcher,
    );
    expect(declared.status).toBe(413);

    const encoded = await proxyQuote(
      new Request(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note: 'é'.repeat(32_800) }),
      }),
      ['request', 'cm00000000000000000000000'],
      fetcher,
    );
    expect(encoded.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only allowlisted query keys and the staff cookie', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ items: [], meta: {} }));
    await proxyQuote(
      new Request('http://localhost:3001/api/quotes?page=2&secret=bad', {
        headers: { cookie: 'mensah_staff_session=safe; unrelated=drop' },
      }),
      [],
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('page=2');
    expect(String(url)).not.toContain('secret');
    expect(new Headers(init?.headers).get('cookie')).toBe(
      'mensah_staff_session=safe',
    );
  });
});
