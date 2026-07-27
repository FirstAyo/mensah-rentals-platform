import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyRentalRequest } from './rental-request-proxy';

describe('fixed public rental request BFF proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects foreign POST origins, non-JSON data, large bodies, and arbitrary paths', async () => {
    const fetcher = vi.fn();
    const foreign = await proxyRentalRequest(
      new Request('http://localhost:3000/api/rental-requests', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      [],
      fetcher,
    );
    expect(foreign.status).toBe(403);
    const plain = await proxyRentalRequest(
      new Request('http://localhost:3000/api/rental-requests', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000' },
        body: '{}',
      }),
      [],
      fetcher,
    );
    expect(plain.status).toBe(415);
    const large = await proxyRentalRequest(
      new Request('http://localhost:3000/api/rental-requests', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: 'x'.repeat(32769),
      }),
      [],
      fetcher,
    );
    expect(large.status).toBe(413);
    const unicodeLarge = await proxyRentalRequest(
      new Request('http://localhost:3000/api/rental-requests', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: '🙂'.repeat(9000),
      }),
      [],
      fetcher,
    );
    expect(unicodeLarge.status).toBe(413);
    const arbitrary = await proxyRentalRequest(
      new Request('http://localhost:3000/api/rental-requests/admin/users'),
      ['admin', 'users'],
      fetcher,
    );
    expect(arbitrary.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only named capabilities and stores the tracking capability in HttpOnly cookie', async () => {
    const capability = 'r'.repeat(43);
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            fulfillmentMethod: 'PICKUP',
            items: [],
            projectName: 'Test event',
            referenceNumber: 'MR-2026-ABCDEFGH23',
            rentalEndDate: '2026-08-03',
            rentalStartDate: '2026-08-01',
            status: {
              key: 'REQUEST_SUBMITTED',
              label: 'Request submitted',
            },
            submittedAt: '2026-07-24T12:00:00.000Z',
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-rental-request-token': capability,
              'x-rental-cart-clear': 'true',
            },
          },
        ),
    );
    const response = await proxyRentalRequest(
      new Request('http://localhost:3000/api/rental-requests', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          Cookie: `mensah_rental_cart=${'c'.repeat(43)}; staff=private`,
        },
        body: '{}',
      }),
      [],
      fetcher,
    );
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-rental-cart-token')).toBe('c'.repeat(43));
    expect(headers.get('cookie')).toBeNull();
    expect(response.headers.get('set-cookie')).toMatch(
      /mensah_rental_request=.*HttpOnly.*SameSite=lax/i,
    );
    expect(await response.text()).not.toContain(capability);
  });

  it('fails closed before an unsafe successful response reaches the browser', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        fulfillmentMethod: 'PICKUP',
        items: [],
        projectName: 'Test event',
        referenceNumber: 'MR-2026-ABCDEFGH23',
        rentalEndDate: '2026-08-03',
        rentalStartDate: '2026-08-01',
        status: { key: 'REQUEST_SUBMITTED', label: 'Request submitted' },
        submittedAt: '2026-07-24T12:00:00.000Z',
        nested: { internalStaffNotes: 'private', reservedQuantity: 4 },
      }),
    );
    const response = await proxyRentalRequest(
      new Request(
        'http://localhost:3000/api/rental-requests/MR-2026-ABCDEFGH23',
      ),
      ['MR-2026-ABCDEFGH23'],
      fetcher,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(
      /internalStaffNotes|reservedQuantity|private/,
    );
  });

  it('maps unsafe upstream errors to a known public message', async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { message: 'internalStaffNotes=private sessionToken=secret' },
        { status: 404 },
      ),
    );
    const response = await proxyRentalRequest(
      new Request(
        'http://localhost:3000/api/rental-requests/MR-2026-ABCDEFGH23',
      ),
      ['MR-2026-ABCDEFGH23'],
      fetcher,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: 'Rental request not found.',
    });
  });
});
