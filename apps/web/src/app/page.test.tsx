import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/public-catalogue', () => ({
  listCategories: vi.fn(async () => ({
    items: [{ description: 'Seating', name: 'Seating', slug: 'seating' }],
    meta: { page: 1, pageSize: 6, total: 1, totalPages: 1 },
  })),
  listProducts: vi.fn(async () => ({
    items: [
      {
        category: { description: 'Seating', name: 'Seating', slug: 'seating' },
        images: [],
        isFeatured: true,
        name: 'Folding Chair',
        rentalUnit: 'each',
        shortDescription: 'Practical event seating.',
        slug: 'folding-chair',
      },
    ],
    meta: { page: 1, pageSize: 4, total: 1, totalPages: 1 },
  })),
}));

import HomePage from './page';

describe('customer website home page', () => {
  it('explains the rental-request model without price or availability claims', async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain('Equip your next production');
    expect(html).toContain('custom quote');
    expect(html).toContain('Folding Chair');
    expect(html).not.toMatch(
      /only \d+ left|\d+ (available|remaining)|total quantity:|\$\d/i,
    );
  });
});
