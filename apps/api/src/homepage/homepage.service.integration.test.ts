import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@mensah-rentals/database';
import { DEFAULT_HOMEPAGE_CONTENT } from '@mensah-rentals/validation';
import { beforeAll, describe, expect, it } from 'vitest';

import { HomepageService } from './homepage.service';
import { HomepageMediaService } from './homepage-media.service';
import { CategoryCoverService } from './category-cover.service';
import { ProductMediaService } from '../media/product-media.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';

describe('homepage immutable publication against PostgreSQL', () => {
  const service = new HomepageService();
  let userId: string;
  let categoryId: string;
  let productId: string;
  let productImageId: string;
  let draftId: string;
  let publishedId: string;
  let heroMediaIds: string[];
  const suffix = randomUUID().replaceAll('-', '');

  beforeAll(async () => {
    if (
      process.env.MENSAH_TEST_DATABASE_GUARD !== 'verified-local-test-database'
    )
      throw new Error(
        'Homepage integration tests require the guarded test database.',
      );
    await prisma.homepageSite.updateMany({
      data: { draftRevisionId: null, publishedRevisionId: null },
    });
    await prisma.homepageActivity.deleteMany();
    await prisma.homepageFeaturedCategory.deleteMany();
    await prisma.homepageFeaturedProduct.deleteMany();
    await prisma.homepageMediaPlacement.deleteMany();
    await prisma.homepageRevision.deleteMany();
    await prisma.homepageMedia.deleteMany();
    await prisma.homepageSite.deleteMany();
    const user = await prisma.user.create({
      data: {
        email: `homepage-${suffix}@example.test`,
        passwordHash: 'test-only',
        firstName: 'Home',
        lastName: 'Editor',
        status: 'ACTIVE',
      },
    });
    const permission = await prisma.permission.upsert({
      where: { key: 'homepage.edit' },
      update: {},
      create: {
        key: 'homepage.edit',
        description: 'Edit homepage drafts',
      },
    });
    const publishPermission = await prisma.permission.upsert({
      where: { key: 'homepage.publish' },
      update: {},
      create: {
        key: 'homepage.publish',
        description: 'Publish homepage revisions',
      },
    });
    const categoryPermission = await prisma.permission.upsert({
      where: { key: 'category.update' },
      update: {},
      create: {
        key: 'category.update',
        description: 'Update categories',
      },
    });
    const mediaPermission = await prisma.permission.upsert({
      where: { key: 'homepage.media.manage' },
      update: {},
      create: {
        key: 'homepage.media.manage',
        description: 'Manage homepage media',
      },
    });
    const productUpdatePermission = await prisma.permission.upsert({
      where: { key: 'product.update' },
      update: {},
      create: {
        key: 'product.update',
        description: 'Update products',
      },
    });
    const role = await prisma.role.upsert({
      where: { name: 'HOMEPAGE_TEST_EDITOR' },
      update: {},
      create: {
        name: 'HOMEPAGE_TEST_EDITOR',
        displayName: 'Homepage test editor',
        description: 'Test-owned homepage permissions',
        isSystem: false,
      },
    });
    await prisma.rolePermission.createMany({
      data: [
        permission,
        publishPermission,
        categoryPermission,
        mediaPermission,
        productUpdatePermission,
      ].map((item) => ({
        roleId: role.id,
        permissionId: item.id,
      })),
      skipDuplicates: true,
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    heroMediaIds = await Promise.all(
      [1, 2, 3].map(async (number) => {
        const contentHash = number.toString().repeat(64);
        const media = await prisma.homepageMedia.create({
          data: {
            contentHash,
            url: `/media/homepage/test${number}/${contentHash}.webp`,
            width: 1600,
            height: 900,
            byteSize: 1000 + number,
            format: 'webp',
            description: `Hero image ${number}`,
            originalFilename: `hero-${number}.webp`,
            createdByUserId: user.id,
          },
        });
        return media.id;
      }),
    );
    const category = await prisma.category.create({
      data: { name: `Homepage ${suffix}`, slug: `homepage-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Homepage product ${suffix}`,
        slug: `homepage-product-${suffix}`,
        shortDescription: 'Safe public description',
      },
    });
    const productImage = await prisma.productImage.create({
      data: {
        productId: product.id,
        url: `/media/products/fallback/${'f'.repeat(64)}.webp`,
        altText: 'Product fallback image',
        sortOrder: 0,
        isPrimary: true,
      },
    });
    userId = user.id;
    categoryId = category.id;
    productId = product.id;
    productImageId = productImage.id;
  });

  it('creates an immutable draft then atomically publishes a copied revision', async () => {
    const before = await prisma.inventoryTransaction.count();
    const draft = (await service.saveDraft(
      {
        expectedLockVersion: 0,
        operationId: randomUUID(),
        content: {
          ...DEFAULT_HOMEPAGE_CONTENT,
          hero: {
            ...DEFAULT_HOMEPAGE_CONTENT.hero,
            heading: `Published ${suffix}`,
            slides: heroMediaIds.map((desktopMediaId, index) => ({
              desktopMediaId,
              mobileMediaId: index === 0 ? heroMediaIds[1] : null,
              description: `Hero image ${index + 1}`,
              focalPoint: 'center' as const,
              enabled: index !== 1,
            })),
          },
        },
        featuredCategoryIds: [categoryId],
        featuredCategoryOverrides: [],
        featuredProductIds: [productId],
      },
      userId,
    )) as { id: string; kind: string };
    draftId = draft.id;
    expect(draft.kind).toBe('DRAFT');
    const published = (await service.publish(
      draft.id,
      { expectedLockVersion: 1, operationId: randomUUID() },
      userId,
    )) as { id: string; kind: string };
    expect(published.kind).toBe('PUBLISHED');
    expect(published.id).not.toBe(draft.id);
    publishedId = published.id;
    const preserved = await prisma.homepageRevision.findUnique({
      where: { id: draft.id },
    });
    expect(preserved?.kind).toBe('DRAFT');
    expect(await prisma.inventoryTransaction.count()).toBe(before);
    const publicResponse = await service.getPublicHomepage();
    expect(publicResponse.content.hero.heading).toBe(`Published ${suffix}`);
    expect(publicResponse.content.hero.slides).toHaveLength(2);
    expect(
      publicResponse.content.hero.slides.map((slide) => slide.description),
    ).toEqual(['Hero image 1', 'Hero image 3']);
    expect(publicResponse.content.hero.slides[0]?.mobileUrl).toContain(
      '/media/homepage/test2/',
    );
    expect(
      await prisma.homepageMediaPlacement.count({
        where: {
          revisionId: published.id,
          slotKey: { startsWith: 'hero.' },
        },
      }),
    ).toBe(4);
    expectPublicDataSafe(publicResponse);
  });

  it('rejects stale writes and leaves the publication unchanged', async () => {
    await expect(
      service.saveDraft(
        {
          expectedLockVersion: 0,
          operationId: randomUUID(),
          content: DEFAULT_HOMEPAGE_CONTENT,
          featuredCategoryIds: [],
          featuredProductIds: [],
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const draft = await prisma.homepageRevision.findUnique({
      where: { id: draftId },
    });
    expect(draft?.kind).toBe('DRAFT');
  });

  it('restores by publishing a new immutable copy', async () => {
    const restored = (await service.restore(
      publishedId,
      { expectedLockVersion: 2, operationId: randomUUID() },
      userId,
    )) as { id: string; kind: string };
    expect(restored.kind).toBe('PUBLISHED');
    expect(restored.id).not.toBe(publishedId);
    expect(
      await prisma.homepageRevision.count({ where: { id: draftId } }),
    ).toBe(1);
  });

  it('does not serve media that is referenced only by an unpublished revision', async () => {
    const mediaId = `cmhp${suffix.slice(0, 18)}`;
    const hash = 'a'.repeat(64);
    await prisma.homepageMedia.create({
      data: {
        id: mediaId,
        contentHash: hash,
        url: `/media/homepage/${mediaId}/${hash}.webp`,
        width: 1,
        height: 1,
        byteSize: 1,
        format: 'webp',
        description: 'Test-only unpublished media',
        originalFilename: 'unpublished.webp',
        createdByUserId: userId,
        placements: {
          create: { revisionId: draftId, slotKey: 'test:unpublished' },
        },
      },
    });
    const mediaService = new HomepageMediaService(
      { get: () => 'storage/test-media' } as never,
      {} as never,
    );
    await expect(
      mediaService.read(mediaId, `${hash}.webp`),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assigns and removes a category cover without deleting source media', async () => {
    const covers = new CategoryCoverService();
    const assigned = await covers.assign(
      categoryId,
      {
        mediaRef: heroMediaIds[0]!,
        altText: 'Homepage-owned category cover',
        focalPoint: 'top',
      },
      userId,
    );
    expect(assigned.resolved.source).toBe('CATEGORY_COVER');
    expect(assigned.cover?.mediaRef).toBe(heroMediaIds[0]);

    await covers.remove(categoryId, userId);
    const removed = await covers.get(categoryId);
    expect(removed.cover).toBeNull();
    expect(removed.resolved.source).toBe('PRODUCT_FALLBACK');
    expect(
      await prisma.homepageMedia.count({ where: { id: heroMediaIds[0] } }),
    ).toBe(1);
  });

  it('searches reusable homepage and product media without copying sources', async () => {
    const media = new HomepageMediaService(
      { get: () => 'storage/test-media' } as never,
      {} as never,
    );
    const beforeHomepage = await prisma.homepageMedia.count();
    const beforeProducts = await prisma.productImage.count();
    const productResults = await media.listLibrary({
      page: 1,
      pageSize: 25,
      search: 'Homepage product',
      source: 'PRODUCT',
    });
    expect(productResults.items.length).toBeGreaterThan(0);
    expect(
      productResults.items.every((item) =>
        item.mediaRef.startsWith('product:'),
      ),
    ).toBe(true);
    const homepageResults = await media.listLibrary({
      page: 1,
      pageSize: 25,
      search: 'hero-1',
      source: 'HOMEPAGE',
    });
    expect(homepageResults.items[0]?.mediaRef).toBe(heroMediaIds[0]);
    expect(await prisma.homepageMedia.count()).toBe(beforeHomepage);
    expect(await prisma.productImage.count()).toBe(beforeProducts);
  });

  it('uses the first eligible product image and preserves referenced media', async () => {
    const covers = new CategoryCoverService();
    await prisma.product.create({
      data: {
        categoryId,
        name: `000 no image ${suffix}`,
        slug: `no-image-${suffix}`,
        shortDescription: 'Intentionally has no image',
      },
    });
    expect((await covers.get(categoryId)).resolved.source).toBe(
      'PRODUCT_FALLBACK',
    );

    await covers.assign(
      categoryId,
      {
        mediaRef: heroMediaIds[0]!,
        altText: 'Protected homepage cover',
        focalPoint: 'center',
      },
      userId,
    );
    const homepageMedia = new HomepageMediaService(
      { get: () => 'storage/test-media' } as never,
      {} as never,
    );
    await expect(
      homepageMedia.remove(heroMediaIds[0]!, userId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await prisma.homepageMedia.count({ where: { id: heroMediaIds[0] } }),
    ).toBe(1);

    await covers.assign(
      categoryId,
      {
        mediaRef: `product:${productImageId}`,
        altText: 'Protected product cover',
        focalPoint: 'center',
      },
      userId,
    );
    const productMedia = new ProductMediaService({
      get: () => 'storage/test-media',
    } as never);
    await expect(
      productMedia.remove(productId, productImageId, userId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await prisma.productImage.count({ where: { id: productImageId } }),
    ).toBe(1);
  });

  it('ignores a category cover after its product moves to another category', async () => {
    const newCategory = await prisma.category.create({
      data: {
        name: `Moved product destination ${suffix}`,
        slug: `moved-product-destination-${suffix}`,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { categoryId: newCategory.id },
    });
    const resolved = await new CategoryCoverService().get(categoryId);
    expect(resolved.cover).toBeNull();
    expect(resolved.resolved.source).toBe('DEFAULT_FALLBACK');
    const publicHomepage = await service.getPublicHomepage();
    expect(
      publicHomepage.categories.find(
        (category) => category.slug === `homepage-${suffix}`,
      )?.image,
    ).toMatchObject({ url: null, source: 'DEFAULT_FALLBACK' });
  });

  it('rechecks live actor state inside a mutation transaction', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'DISABLED' },
    });
    await expect(
      service.saveDraft(
        {
          expectedLockVersion: 3,
          operationId: randomUUID(),
          content: DEFAULT_HOMEPAGE_CONTENT,
          featuredCategoryIds: [],
          featuredProductIds: [],
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
