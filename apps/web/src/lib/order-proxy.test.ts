import { describe, expect, it, vi } from 'vitest';

import { proxyOrder } from './order-proxy';

const capability = '00000000-0000-4000-8000-000000000000.' + 'a'.repeat(43);

const publicOrder = {
  chargeTotalCents: 2_000,
  charges: [
    {
      amountCents: 2_000,
      label: 'Delivery',
      taxable: true,
      type: 'DELIVERY',
    },
  ],
  companyName: 'Customer Company',
  confirmedAt: '2027-01-01T10:00:00.000Z',
  currency: 'CAD',
  customerName: 'Customer Name',
  customerNotes: 'Please call on arrival.',
  deliveryAddress: '1 Example Street',
  discountCents: 500,
  fulfillmentMethod: 'DELIVERY',
  itemSubtotalCents: 10_000,
  items: [
    {
      approvedQuantity: 10,
      lineSubtotalCents: 10_000,
      productName: 'Folding Chair',
      productSlug: 'folding-chair',
      quotedQuantity: 10,
      rentalUnit: 'each',
      taxable: true,
      unitPriceCents: 1_000,
    },
  ],
  notice:
    'Your rental order is confirmed. Equipment allocation and fulfilment scheduling will be completed by our team.',
  orderNumber: 'RO-ABC123',
  projectLocation: 'Toronto',
  projectName: 'Example Event',
  projectNotes: null,
  projectType: 'Event',
  rentalEndDate: '2027-01-03',
  rentalStartDate: '2027-01-02',
  reservationStatus: 'NOT_RESERVED',
  status: 'CONFIRMED',
  subtotalCents: 12_000,
  tax: {
    name: 'HST',
    rateBasisPoints: 1_300,
    taxAmountCents: 1_495,
    taxableAmountCents: 11_500,
  },
  taxableSubtotalCents: 11_500,
  taxCents: 1_495,
  terms: 'Rental terms.',
  totalCents: 12_995,
} as const;

describe('customer rental order BFF', () => {
  it('uses a fixed route allowlist', async () => {
    expect(
      (
        await proxyOrder(new Request('http://localhost:3000/api/order/admin'), [
          'admin',
        ])
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyOrder(
          new Request('http://localhost:3000/api/order', { method: 'POST' }),
          [],
        )
      ).status,
    ).toBe(404);
  });

  it('requires same-origin JSON for capability exchange', async () => {
    const crossOrigin = await proxyOrder(
      new Request('http://localhost:3000/api/order/access', {
        method: 'POST',
        headers: {
          origin: 'https://evil.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ capability }),
      }),
      ['access'],
    );
    expect(crossOrigin.status).toBe(403);

    const wrongType = await proxyOrder(
      new Request('http://localhost:3000/api/order/access', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ capability }),
      }),
      ['access'],
    );
    expect(wrongType.status).toBe(415);
  });

  it('rejects oversized declared and encoded bodies before proxying', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const declared = await proxyOrder(
      new Request('http://localhost:3000/api/order/access', {
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

    const encoded = await proxyOrder(
      new Request('http://localhost:3000/api/order/access', {
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

  it('uses a uniform unavailable response for invalid, missing, and rejected access', async () => {
    const invalid = await proxyOrder(
      new Request('http://localhost:3000/api/order/access', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: '{',
      }),
      ['access'],
    );
    const missing = await proxyOrder(
      new Request('http://localhost:3000/api/order'),
      [],
    );
    const rejected = await proxyOrder(
      new Request('http://localhost:3000/api/order', {
        headers: { cookie: `mensah_order_access=${capability}` },
      }),
      [],
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ message: 'revoked' }, { status: 410 }),
        ),
    );

    for (const response of [invalid, missing, rejected]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: 'Order is unavailable',
      });
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  });

  it('exchanges a capability into a dedicated HttpOnly cookie', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ expiresAt: '2027-01-01T00:00:00.000Z' }),
      );
    const response = await proxyOrder(
      new Request('http://localhost:3000/api/order/access', {
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
    expect(response.headers.get('set-cookie')).toContain(
      'mensah_order_access=',
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')?.toLowerCase()).toContain(
      'samesite=lax',
    );
    expect(String(fetcher.mock.calls[0]![0])).not.toContain(capability);
  });

  it('returns only an exact recursively allowlisted public order', async () => {
    const safe = await proxyOrder(
      new Request('http://localhost:3000/api/order', {
        headers: { cookie: `mensah_order_access=${capability}` },
      }),
      [],
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(publicOrder)),
    );
    expect(safe.status).toBe(200);
    await expect(safe.json()).resolves.toEqual(publicOrder);

    const unsafeNested = {
      ...publicOrder,
      items: [{ ...publicOrder.items[0], availableQuantity: 999 }],
    };
    const unsafe = await proxyOrder(
      new Request('http://localhost:3000/api/order', {
        headers: { cookie: `mensah_order_access=${capability}` },
      }),
      [],
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(unsafeNested)),
    );
    expect(unsafe.status).toBe(502);
    await expect(unsafe.json()).resolves.toEqual({
      message: 'Order service returned an unsafe response',
    });
  });
});
