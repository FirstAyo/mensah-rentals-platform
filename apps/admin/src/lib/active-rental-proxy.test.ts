import { describe, expect, it, vi } from 'vitest';
import { proxyActiveRental } from './active-rental-proxy';

describe('active rental fixed BFF', () => {
  it('allows only list/detail GET routes and forwards only allowlisted queries', async () => {
    const fetcher = vi.fn(async (url: string) => Response.json({ url }));
    const response = await proxyActiveRental(
      new Request(
        'http://localhost:3001/api/active-rentals?page=1&internalNotes=true',
      ),
      [],
      fetcher as unknown as typeof fetch,
    );
    expect(response.status).toBe(200);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('page=1');
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain('internalNotes');
    expect(
      (
        await proxyActiveRental(
          new Request('http://localhost:3001/api/active-rentals/x/checkout', {
            method: 'POST',
          }),
          ['x', 'checkout'],
          fetcher as unknown as typeof fetch,
        )
      ).status,
    ).toBe(404);
  });
});
