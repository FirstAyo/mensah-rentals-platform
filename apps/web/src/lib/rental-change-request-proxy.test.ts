import { describe, expect, it, vi } from 'vitest';

import { proxyRentalChangeRequest } from './rental-change-request-proxy';

describe('fixed public rental change-request BFF proxy', () => {
  it('fails closed when a successful response contains an internal field', async () => {
    const fetcher = vi.fn(async () =>
      Response.json([
        {
          companyName: null,
          contactEmail: 'customer@example.com',
          contactFirstName: 'Ama',
          contactLastName: 'Mensah',
          contactPhone: '+233200000000',
          createdAt: '2026-07-28T12:00:00.000Z',
          customerNotes: null,
          deliveryAddress: null,
          fulfillmentMethod: 'PICKUP',
          id: 'clz123456789012345678900',
          items: [],
          projectLocation: 'Accra',
          projectName: 'Test event',
          projectType: 'Event',
          reason: { internalNotes: 'private' },
          rentalEndDate: '2026-08-03',
          rentalStartDate: '2026-08-01',
          requestedTimeZone: 'Africa/Accra',
          source: 'ACCEPTED_QUOTE',
          status: 'SUBMITTED',
        },
      ]),
    );

    const response = await proxyRentalChangeRequest(
      new Request('http://localhost:3000/api/change-requests'),
      [],
      fetcher,
    );

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private');
  });

  it('rejects generic paths before calling the API', async () => {
    const fetcher = vi.fn();
    const response = await proxyRentalChangeRequest(
      new Request('http://localhost:3000/api/change-requests/admin/users'),
      ['admin', 'users'],
      fetcher,
    );

    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
