import { describe, expect, it } from 'vitest';
import {
  createCategorySchema,
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from './index';

describe('catalogue validation', () => {
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
