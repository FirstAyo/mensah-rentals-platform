import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCartResponse, clearCart, removeCartItem } from './cart-client';

const safeCart = {
  desiredUnitCount: 100,
  distinctItemCount: 1,
  items: [
    {
      desiredQuantity: 100,
      product: {
        category: { name: 'Seating', slug: 'seating' },
        image: null,
        name: 'Folding Chair',
        rentalUnit: 'each',
        requestable: true,
        shortDescription: 'Practical seating',
        slug: 'folding-chair',
      },
    },
  ],
};

describe('public cart response boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('permits customer-desired quantity in the exact allowlisted contract', () => {
    expect(() => assertCartResponse(safeCart)).not.toThrow();
  });

  it.each([
    { inventory: { totalQuantity: 80 } },
    { availableQuantity: 80 },
    { reservation: { id: 'secret' } },
    { price: 200 },
    { tokenHash: 'secret' },
    { assetNumber: 'ASSET-1' },
  ])('rejects confidential or out-of-scope response keys', (extra) => {
    expect(() => assertCartResponse({ ...safeCart, ...extra })).toThrow(
      /Unsafe/,
    );
  });

  it('rejects unmanaged image paths and unknown nested product keys', () => {
    const withImage = structuredClone(safeCart);
    Object.assign(withImage.items[0]!.product, {
      image: {
        altText: 'Chair',
        isPrimary: true,
        url: 'C:\\private\\chair.webp',
      },
    });
    expect(() => assertCartResponse(withImage)).toThrow(/Unsafe/);
    const extra = structuredClone(safeCart) as typeof safeCart & {
      items: Array<{ product: { internalNote?: string } }>;
    };
    extra.items[0]!.product.internalNote = 'private';
    expect(() => assertCartResponse(extra)).toThrow(/Unsafe/);
  });

  it.each([
    [
      'remove',
      () => removeCartItem('folding-chair'),
      '/api/cart/items/folding-chair',
    ],
    ['clear', () => clearCart(), '/api/cart'],
  ])(
    'sends %s as an authenticated JSON mutation contract',
    async (_, act, url) => {
      const fetcher = vi.fn(async () => Response.json(safeCart));
      vi.stubGlobal('fetch', fetcher);

      await act();

      expect(fetcher).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          body: '{}',
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    },
  );
});
