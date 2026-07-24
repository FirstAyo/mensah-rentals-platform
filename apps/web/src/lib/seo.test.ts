import { beforeEach, describe, expect, it, vi } from 'vitest';
const { listCategoriesMock, listProductsMock } = vi.hoisted(() => ({
  listCategoriesMock: vi.fn(),
  listProductsMock: vi.fn(),
}));
vi.mock('./public-catalogue', () => ({
  listCategories: listCategoriesMock,
  listProducts: listProductsMock,
}));
import robots from '../app/robots';
import sitemap from '../app/sitemap';
import { productJsonLd } from './structured-data';
beforeEach(() => {
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.SITE_INDEXING_ENABLED = 'false';
  listCategoriesMock.mockImplementation(async (query: string) => ({
    items: [
      {
        name: query.includes('page=2') ? 'Tents' : 'Seating',
        slug: query.includes('page=2') ? 'tents' : 'seating',
        description: null,
      },
    ],
    meta: { totalPages: query.includes('page=2') ? 2 : 2 },
  }));
  listProductsMock.mockImplementation(async (query: string) => ({
    items: [
      {
        name: query.includes('page=2') ? 'Tent' : 'Chair',
        slug: query.includes('page=2') ? 'tent' : 'chair',
        category: {
          name: 'Category',
          slug: query.includes('page=2') ? 'tents' : 'seating',
          description: null,
        },
        images: [],
        shortDescription: 'Description',
        rentalUnit: 'each',
        isFeatured: false,
      },
    ],
    meta: { totalPages: 2 },
  }));
});
describe('SEO contracts', () => {
  it('disallows indexing locally', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
  it('keeps the stateful cart out of production crawling', () => {
    process.env.SITE_INDEXING_ENABLED = 'true';
    expect(JSON.stringify(robots())).toContain('/cart');
  });
  it('paginates the entire public sitemap and excludes admin routes', async () => {
    const entries = await sitemap();
    expect(entries.map(({ url }) => url)).toContain(
      'http://localhost:3000/rentals/tents/tent',
    );
    expect(JSON.stringify(entries)).not.toMatch(/admin|login|cart|\?/);
  });
  it('emits truthful product data without offers, price, or availability', () => {
    const data = productJsonLd(
      {
        name: 'Chair',
        slug: 'chair',
        category: { name: 'Seating', slug: 'seating', description: null },
        images: [],
        shortDescription: 'Chair',
        description: null,
        rentalUnit: 'each',
        isFeatured: false,
        relatedProducts: [],
        specifications: [],
      },
      'https://mensahrentals.com',
    );
    expect(data).toMatchObject({ '@type': 'Product', name: 'Chair' });
    expect(JSON.stringify(data)).not.toMatch(
      /offer|price|availability|rating|review/i,
    );
  });
});
