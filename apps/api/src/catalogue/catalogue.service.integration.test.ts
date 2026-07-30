import { randomUUID } from 'node:crypto';

import { prisma } from '@mensah-rentals/database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CatalogueRepository } from './catalogue.repository';
import { CatalogueService } from './catalogue.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';
import type { ProductMediaService } from '../media/product-media.service';

describe('catalogue service against PostgreSQL', () => {
  const removeCommittedFiles = vi.fn(async () => undefined);
  const service = new CatalogueService(new CatalogueRepository(), {
    removeCommittedFiles,
  } as unknown as ProductMediaService);
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
    expectPublicDataSafe(page);
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
    expectPublicDataSafe(detail);
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

  it('renames categories, normalizes editable slugs, and rejects duplicates', async () => {
    const category = await prisma.category.create({
      data: { name: `Editable ${suffix}`, slug: `editable-${suffix}` },
    });
    const renamed = await service.updateCategory(category.id, {
      description: null,
      name: `Renamed ${suffix}`,
      slug: `editable-${suffix}`,
      sortOrder: 3,
    });
    expect(renamed).toMatchObject({
      name: `Renamed ${suffix}`,
      slug: `editable-${suffix}`,
    });
    const reslugged = await service.updateCategory(category.id, {
      description: null,
      name: `Renamed ${suffix}`,
      slug: `  Renamed-${suffix.toUpperCase()}  `,
      sortOrder: 3,
    });
    expect(reslugged).toMatchObject({
      name: `Renamed ${suffix}`,
      slug: `renamed-${suffix}`,
    });
    await expect(
      service.updateCategory(category.id, {
        description: null,
        name: `Renamed ${suffix}`,
        slug: `active-${suffix}`,
        sortOrder: 3,
      }),
    ).rejects.toMatchObject({
      response: { message: 'That category slug is already in use.' },
    });
    await prisma.category.delete({ where: { id: category.id } });
  });

  it('hard-deletes empty and unreferenced catalogue records after confirmation', async () => {
    const empty = await prisma.category.create({
      data: { name: `Empty ${suffix}`, slug: `empty-${suffix}` },
    });
    await expect(
      service.deleteCategory(empty.id, { confirmDeleteProducts: false }),
    ).resolves.toMatchObject({
      categoryDeleted: true,
      productsRemovedFromCatalogue: 0,
    });
    expect(
      await prisma.category.findUnique({ where: { id: empty.id } }),
    ).toBeNull();

    const category = await prisma.category.create({
      data: { name: `Disposable ${suffix}`, slug: `disposable-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Disposable product ${suffix}`,
        slug: `disposable-product-${suffix}`,
        shortDescription: 'No historical references',
        images: {
          create: {
            altText: 'Disposable',
            isPrimary: true,
            url: `/media/products/disposable/${'a'.repeat(64)}.webp`,
          },
        },
      },
    });
    await expect(
      service.deleteCategory(category.id, { confirmDeleteProducts: false }),
    ).rejects.toMatchObject({
      response: {
        code: 'CATEGORY_DELETE_CONFIRMATION_REQUIRED',
        productCount: 1,
      },
    });
    const deleted = await service.deleteCategory(category.id, {
      confirmDeleteProducts: true,
    });
    expect(deleted).toMatchObject({
      hardDeletedProductCount: 1,
      productsRemovedFromCatalogue: 1,
      tombstonedProductCount: 0,
    });
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).toBeNull();
    expect(removeCommittedFiles).toHaveBeenCalled();
  });

  it('tombstones referenced products while preserving immutable request history', async () => {
    const category = await prisma.category.create({
      data: { name: `History ${suffix}`, slug: `history-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `History product ${suffix}`,
        slug: `history-product-${suffix}`,
        shortDescription: 'Referenced product',
      },
    });
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.rentalRequest.create({
        data: {
          contactEmail: 'history@example.test',
          contactFirstName: 'History',
          contactLastName: 'Keeper',
          contactPhone: '+15555550101',
          fulfillmentMethod: 'PICKUP',
          projectLocation: 'Test location',
          projectName: `History ${suffix}`,
          projectType: 'Test',
          referenceNumber: `MR-2026-${suffix.slice(0, 10).toUpperCase()}`,
          rentalEndDate: new Date('2027-01-02T00:00:00.000Z'),
          rentalStartDate: new Date('2027-01-01T00:00:00.000Z'),
          requestedTimeZone: 'UTC',
          sourceCartTokenHash: '1'.repeat(32) + suffix.slice(0, 32),
          submissionKeyHash: '2'.repeat(32) + suffix.slice(0, 32),
          submissionPayloadHash: suffix.repeat(2),
          items: {
            create: {
              categoryName: category.name,
              categorySlug: category.slug,
              productId: product.id,
              productName: product.name,
              productSlug: product.slug,
              rentalUnit: 'each',
              requestedQuantity: 2,
            },
          },
        },
        include: { items: true },
      });
      const revision = await tx.rentalRequestRevision.create({
        data: {
          amendmentReason: null,
          companyName: created.companyName,
          contactEmail: created.contactEmail,
          contactFirstName: created.contactFirstName,
          contactLastName: created.contactLastName,
          contactPhone: created.contactPhone,
          customerNotes: created.customerNotes,
          deliveryAddress: created.deliveryAddress,
          fulfillmentMethod: created.fulfillmentMethod,
          operationId: randomUUID(),
          payloadHash: suffix.repeat(2),
          projectLocation: created.projectLocation,
          projectName: created.projectName,
          projectType: created.projectType,
          rentalEndDate: created.rentalEndDate,
          rentalRequestId: created.id,
          rentalStartDate: created.rentalStartDate,
          requestedTimeZone: created.requestedTimeZone,
          revisionNumber: 1,
          submittedByType: 'ORIGINAL_SUBMISSION',
          items: {
            create: created.items.map((item, sortOrder) => ({
              categoryNameSnapshot: item.categoryName,
              categorySlugSnapshot: item.categorySlug,
              primaryImageUrlSnapshot: null,
              productId: item.productId,
              productNameSnapshot: item.productName,
              productSlugSnapshot: item.productSlug,
              rentalUnitSnapshot: item.rentalUnit,
              requestedQuantity: item.requestedQuantity,
              sortOrder,
            })),
          },
        },
      });
      await tx.rentalRequest.update({
        where: { id: created.id },
        data: { currentRevisionId: revision.id },
      });
      return created;
    });
    const deleted = await service.deleteCategory(category.id, {
      confirmDeleteProducts: true,
    });
    expect(deleted).toMatchObject({
      hardDeletedProductCount: 0,
      tombstonedProductCount: 1,
    });
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).toMatchObject({
      deletedAt: expect.any(Date),
      isActive: false,
    });
    expect(
      await prisma.rentalRequestItem.findFirst({
        where: { rentalRequestId: request.id },
      }),
    ).toMatchObject({
      productName: product.name,
      requestedQuantity: 2,
    });
    expect(
      (
        await service.listAdminCategories({
          page: 1,
          pageSize: 100,
          search: `History ${suffix}`,
          sortBy: 'name',
          sortDirection: 'asc',
        })
      ).items,
    ).toHaveLength(0);
  });
});
