import type { PublicProductSummaryResponse } from '@mensah-rentals/types';
import { describe, expect, it } from 'vitest';

import {
  GALLERY_PRODUCT_LIMIT,
  selectGalleryProducts,
} from './gallery-merchandising';

function product(
  name: string,
  category: string,
  isFeatured = false,
): PublicProductSummaryResponse {
  return {
    category: {
      description: `${category} category`,
      name: category,
      slug: category.toLowerCase(),
    },
    images: [],
    isFeatured,
    name,
    rentalUnit: 'each',
    shortDescription: `${name} for events and productions.`,
    slug: name.toLowerCase().replaceAll(' ', '-'),
  };
}

describe('Gallery product merchandising', () => {
  it('keeps featured products first, fills diverse categories, and removes duplicates', () => {
    const featured = product('Featured Tent', 'Shelter', true);
    const result = selectGalleryProducts([
      featured,
      featured,
      product('Second Featured', 'Shelter', true),
      product('Chair', 'Seating'),
      product('Table', 'Furniture'),
      product('Bench', 'Seating'),
      product('Light', 'Lighting'),
      product('Speaker', 'Audio'),
      product('Barrier', 'Safety'),
      product('Generator', 'Power'),
      product('Extra', 'Other'),
    ]);

    expect(result).toHaveLength(GALLERY_PRODUCT_LIMIT);
    expect(result.slice(0, 2).every((item) => item.isFeatured)).toBe(true);
    expect(new Set(result.map((item) => item.slug)).size).toBe(result.length);
    expect(result.slice(2, 6).map((item) => item.category.slug)).toEqual([
      'seating',
      'furniture',
      'lighting',
      'audio',
    ]);
  });

  it('returns no products for a non-positive limit', () => {
    expect(selectGalleryProducts([product('Chair', 'Seating')], 0)).toEqual([]);
  });
});
