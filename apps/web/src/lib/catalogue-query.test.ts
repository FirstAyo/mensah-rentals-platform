import { describe, expect, it } from 'vitest';
import {
  catalogueApiQuery,
  catalogueHref,
  parseCatalogueQuery,
} from './catalogue-query';

describe('public catalogue query state', () => {
  it('normalizes invalid public query values safely', () => {
    expect(
      parseCatalogueQuery({
        featured: 'false',
        page: 'Infinity',
        search: '  chair  ',
        sort: 'updatedAt',
      }),
    ).toEqual({ featured: false, page: 1, search: 'chair', sort: 'featured' });
  });

  it('builds an allowlisted API query and preserves filters in page links', () => {
    const state = {
      featured: true,
      page: 2,
      search: 'frame tent',
      sort: 'name-desc' as const,
    };
    expect(catalogueApiQuery(state, 'tents')).toBe(
      '?page=2&pageSize=12&sort=name-desc&categorySlug=tents&search=frame+tent&isFeatured=true',
    );
    expect(catalogueHref('/rentals/tents', state, 3)).toBe(
      '/rentals/tents?search=frame+tent&featured=true&sort=name-desc&page=3',
    );
  });
});
