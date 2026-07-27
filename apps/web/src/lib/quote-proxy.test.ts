import { describe, expect, it, vi } from 'vitest';

import { proxyQuote } from './quote-proxy';

const capability = '00000000-0000-4000-8000-000000000000.' + 'a'.repeat(43);

describe('customer quote BFF', () => {
  it('requires same-origin JSON exchange and rejects arbitrary routes', async () => {
    expect(
      (
        await proxyQuote(
          new Request('http://localhost:3000/api/quote/access', {
            method: 'POST',
            headers: {
              origin: 'https://evil.test',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ capability }),
          }),
          ['access'],
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await proxyQuote(new Request('http://localhost:3000/api/quote/admin'), [
          'admin',
        ])
      ).status,
    ).toBe(404);
  });

  it('rejects oversized declared and encoded bodies before proxying', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const declared = await proxyQuote(
      new Request('http://localhost:3000/api/quote/access', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'content-length': String(8 * 1024 + 1),
        },
        body: '{}',
      }),
      ['access'],
      fetcher,
    );
    expect(declared.status).toBe(413);

    const encoded = await proxyQuote(
      new Request('http://localhost:3000/api/quote/access', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ capability: 'é'.repeat(4_100) }),
      }),
      ['access'],
      fetcher,
    );
    expect(encoded.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a controlled 422 for malformed JSON', async () => {
    const response = await proxyQuote(
      new Request('http://localhost:3000/api/quote/respond', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          cookie: `mensah_quote_access=${capability}`,
        },
        body: '{',
      }),
      ['respond'],
    );
    expect(response.status).toBe(422);
  });

  it('exchanges a capability into an HttpOnly cookie without returning it', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ expiresAt: '2027-01-01T00:00:00.000Z' }),
      );
    const response = await proxyQuote(
      new Request('http://localhost:3000/api/quote/access', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ capability }),
      }),
      ['access'],
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(
      await (fetcher.mock.calls[0]![0] as Request | string).toString(),
    ).not.toContain(capability);
  });

  it('fails closed when upstream adds a confidential field', async () => {
    const unsafe = {
      chargeTotalCents: 0,
      charges: [],
      currency: 'CAD',
      customerName: 'Customer',
      customerNotes: null,
      discountCents: 0,
      itemSubtotalCents: 100,
      items: [
        {
          approvedQuantity: 1,
          lineSubtotalCents: 100,
          productName: 'Chair',
          productSlug: 'chair',
          quotedQuantity: 1,
          rentalUnit: 'each',
          taxable: true,
          unitPriceCents: 100,
        },
      ],
      notice: 'No reservation',
      quoteNumber: 'QT-123',
      rentalEndDate: '2027-01-02',
      rentalStartDate: '2027-01-01',
      revisionNumber: 1,
      status: 'SENT',
      subtotalCents: 100,
      taxableSubtotalCents: 100,
      tax: {
        name: 'Tax',
        rateBasisPoints: 0,
        taxAmountCents: 0,
        taxableAmountCents: 100,
      },
      taxCents: 0,
      terms: null,
      totalCents: 100,
      validUntil: '2027-01-01T12:00:00.000Z',
      internalNotes: 'secret',
    };
    const response = await proxyQuote(
      new Request('http://localhost:3000/api/quote', {
        headers: { cookie: `mensah_quote_access=${capability}` },
      }),
      [],
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(unsafe)),
    );
    expect(response.status).toBe(502);
  });
});
