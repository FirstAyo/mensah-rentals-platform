import { describe, expect, it } from 'vitest';
import {
  createCategorySchema,
  createProductSchema,
  productListQuerySchema,
  publicProductListQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from './index';

describe('catalogue validation', () => {
  it('normalizes category edits and returns friendly validation messages', () => {
    expect(
      updateCategorySchema.parse({
        name: '  Seating  ',
        slug: '  EVENT-SEATING  ',
        sortOrder: 0,
      }),
    ).toMatchObject({ name: 'Seating', slug: 'event-seating' });
    const invalidName = updateCategorySchema.safeParse({
      name: '   ',
      slug: 'seating',
      sortOrder: 0,
    });
    expect(invalidName.success).toBe(false);
    if (!invalidName.success)
      expect(invalidName.error.issues[0]?.message).toBe(
        'Please enter a category name.',
      );
    const invalidSlug = updateCategorySchema.safeParse({
      name: 'Seating',
      slug: 'not a slug!',
      sortOrder: 0,
    });
    expect(invalidSlug.success).toBe(false);
    if (!invalidSlug.success)
      expect(invalidSlug.error.issues[0]?.message).toBe(
        'Please enter a valid category slug.',
      );
  });

  it('normalizes product edits and returns friendly name and slug messages', () => {
    const base = {
      categoryId: 'cm00000000000000000000000',
      description: null,
      isFeatured: false,
      name: '  Folding Chair  ',
      rentalUnit: 'each',
      shortDescription: 'A folding chair.',
      slug: '  FOLDING-CHAIR  ',
      specifications: [],
    };
    expect(updateProductSchema.parse(base)).toMatchObject({
      name: 'Folding Chair',
      slug: 'folding-chair',
    });
    for (const slug of ['   ', 'not a slug!']) {
      const result = updateProductSchema.safeParse({ ...base, slug });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0]?.message).toBe(
          'Please enter a valid product slug.',
        );
    }
    const name = updateProductSchema.safeParse({ ...base, name: '   ' });
    expect(name.success).toBe(false);
    if (!name.success)
      expect(name.error.issues[0]?.message).toBe(
        'Please enter a product name.',
      );
  });
  it('accepts safe product metadata without media mutations', () => {
    const base = {
      categoryId: 'cm00000000000000000000000',
      name: 'Chair',
      slug: 'chair',
      shortDescription: 'A folding chair.',
      description: null,
      rentalUnit: 'each',
      isFeatured: false,
      specifications: [],
    };
    expect(
      createProductSchema.safeParse({ ...base, isActive: true }).success,
    ).toBe(true);
  });

  it('rejects unsafe slugs, media association, and mass assignment', () => {
    expect(
      createCategorySchema.safeParse({
        name: 'Chairs',
        slug: 'Chairs!',
        sortOrder: 0,
        isActive: true,
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        categoryId: 'cm00000000000000000000000',
        name: 'Chair',
        slug: 'chair',
        shortDescription: 'Chair',
        rentalUnit: 'each',
        isFeatured: false,
        images: [],
        specifications: [],
        isActive: true,
      }).success,
    ).toBe(false);
    expect(
      updateProductSchema.safeParse({
        categoryId: 'cm00000000000000000000000',
        name: 'Chair',
        slug: 'changed',
        shortDescription: 'Chair',
        rentalUnit: 'each',
        isFeatured: false,
        images: [],
        specifications: [],
        totalQuantity: 10,
      }).success,
    ).toBe(false);
  });

  it('bounds and parses server-side list queries without boolean coercion surprises', () => {
    expect(
      productListQuerySchema.parse({
        page: '2',
        pageSize: '20',
        isActive: 'false',
      }).isActive,
    ).toBe(false);
    expect(productListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(
      false,
    );
    expect(
      productListQuerySchema.safeParse({ sortBy: 'DROP TABLE Product' })
        .success,
    ).toBe(false);
  });

  it('keeps public product filters semantic and rejects administrative controls', () => {
    expect(
      publicProductListQuerySchema.parse({
        isFeatured: 'true',
        page: '2',
        sort: 'name-desc',
      }),
    ).toMatchObject({ isFeatured: true, page: 2, sort: 'name-desc' });
    expect(
      publicProductListQuerySchema.safeParse({ isActive: 'false' }).success,
    ).toBe(false);
    expect(
      publicProductListQuerySchema.safeParse({
        categoryId: 'cm00000000000000000000000',
      }).success,
    ).toBe(false);
    expect(
      publicProductListQuerySchema.safeParse({ page: '10001' }).success,
    ).toBe(false);
  });
});

it('keeps image association exclusive to the validated media API', () => {
  const result = createProductSchema.safeParse({
    categoryId: 'cm00000000000000000000000',
    name: 'Chair',
    slug: 'chair',
    shortDescription: 'Chair',
    rentalUnit: 'each',
    isFeatured: false,
    isActive: true,
    specifications: [],
    images: [],
  });
  expect(result.success).toBe(false);
});
