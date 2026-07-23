import { afterEach, describe, expect, it, vi } from 'vitest';
import { listProducts } from './public-catalogue';
afterEach(() => vi.unstubAllGlobals());
describe('public catalogue server boundary', () => {
  it('rejects forbidden nested inventory fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [{ name: 'Chair', inventory: { availableQuantity: 8 } }],
              meta: {},
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(listProducts()).rejects.toThrow(
      'Unsafe public catalogue response',
    );
  });
  it('accepts an allowlisted public shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [],
              meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(listProducts()).resolves.toMatchObject({
      items: [],
      meta: { total: 0 },
    });
  });
  it('rejects administrative fields and internal media paths', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          items: [
            {
              category: { description: null, name: 'Seating', slug: 'seating' },
              images: [
                {
                  altText: 'Chair',
                  isPrimary: true,
                  url: 'C:\\private\\storage\\chair.webp',
                },
              ],
              isActive: true,
              isFeatured: false,
              name: 'Chair',
              rentalUnit: 'each',
              shortDescription: 'Chair',
              slug: 'chair',
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      ),
    );
    await expect(listProducts()).rejects.toThrow(/Unsafe public/);
  });
});
