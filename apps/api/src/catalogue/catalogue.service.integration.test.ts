import { randomUUID } from 'node:crypto';

import { prisma } from '@mensah-rentals/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CatalogueRepository } from './catalogue.repository';
import { CatalogueService } from './catalogue.service';

describe('catalogue service against PostgreSQL', () => {
  const service = new CatalogueService(new CatalogueRepository());
  const suffix = randomUUID().replaceAll('-', '');
  const categoryIds: string[] = [];

  beforeAll(async () => {
    const active = await prisma.category.create({
      data: { name: `Active ${suffix}`, slug: `active-${suffix}` },
    });
    const inactive = await prisma.category.create({
      data: {
        name: `Inactive ${suffix}`,
        slug: `inactive-${suffix}`,
        isActive: false,
      },
    });
    categoryIds.push(active.id, inactive.id);
    await prisma.product.createMany({
      data: [
        {
          categoryId: active.id,
          name: `Alpha ${suffix}`,
          slug: `alpha-${suffix}`,
          shortDescription: 'Search needle',
        },
        {
          categoryId: active.id,
          name: `Beta ${suffix}`,
          slug: `beta-${suffix}`,
          shortDescription: 'Second result',
          isActive: false,
        },
        {
          categoryId: active.id,
          name: `Gamma ${suffix}`,
          slug: `gamma-${suffix}`,
          shortDescription: 'Related result',
        },
        {
          categoryId: inactive.id,
          name: `Hidden ${suffix}`,
          slug: `hidden-${suffix}`,
          shortDescription: 'Inactive parent',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  });

  it('applies real server-side search and pagination', async () => {
    const page = await service.listAdminProducts({
      page: 1,
      pageSize: 1,
      search: suffix,
      sortBy: 'name',
      sortDirection: 'asc',
    });
    expect(page.meta.total).toBe(4);
    expect(page.items).toHaveLength(1);
    const search = await service.listAdminProducts({
      page: 1,
      pageSize: 20,
      search: 'needle',
      sortBy: 'name',
      sortDirection: 'asc',
    });
    expect(search.items.map(({ name }) => name)).toEqual([`Alpha ${suffix}`]);
  });

  it('excludes inactive products and products under inactive categories publicly', async () => {
    const page = await service.listPublicProducts({
      page: 1,
      pageSize: 100,
      search: 'needle',
      sort: 'name-asc',
    });
    expect(page.items.map(({ name }) => name)).toEqual([`Alpha ${suffix}`]);
    expect(JSON.stringify(page)).not.toMatch(
      /inventory|totalQuantity|availableQuantity|assetNumber/i,
    );
  });

  it('returns bounded active related products through the public allowlist', async () => {
    const detail = await service.getPublicProduct(
      `active-${suffix}`,
      `alpha-${suffix}`,
    );
    expect(detail.relatedProducts.map(({ name }) => name)).toEqual([
      `Gamma ${suffix}`,
    ]);
    expect(Object.keys(detail).sort()).toEqual(
      [
        'category',
        'description',
        'images',
        'isFeatured',
        'name',
        'relatedProducts',
        'rentalUnit',
        'shortDescription',
        'slug',
        'specifications',
      ].sort(),
    );
    expect(JSON.stringify(detail)).not.toMatch(
      /inventory|quantity|asset|serial|isActive|createdAt|categoryId/i,
    );
  });

  it('paginates active categories with actual database queries', async () => {
    const page = await service.listPublicCategories({
      page: 1,
      pageSize: 1,
      search: suffix,
    });
    expect(page.meta.total).toBe(1);
    expect(page.items[0]?.name).toBe(`Active ${suffix}`);
  });
});
