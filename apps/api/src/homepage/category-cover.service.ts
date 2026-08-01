import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, UserStatus, prisma } from '@mensah-rentals/database';
import type { CategoryCoverInput } from '@mensah-rentals/validation';

function split(reference: string) {
  return reference.startsWith('product:')
    ? { productImageId: reference.slice('product:'.length) }
    : { homepageMediaId: reference };
}

@Injectable()
export class CategoryCoverService {
  async get(categoryId: string) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      include: {
        cover: {
          include: {
            homepageMedia: true,
            productImage: {
              include: {
                product: {
                  select: {
                    categoryId: true,
                    isActive: true,
                    deletedAt: true,
                  },
                },
              },
            },
          },
        },
        products: {
          where: { isActive: true, deletedAt: null, images: { some: {} } },
          orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }, { id: 'asc' }],
          take: 1,
          select: {
            images: {
              orderBy: [
                { isPrimary: 'desc' },
                { sortOrder: 'asc' },
                { id: 'asc' },
              ],
              take: 1,
            },
          },
        },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    const coverRecord = category.cover;
    const validProductCover =
      coverRecord?.productImage?.product.categoryId === category.id &&
      coverRecord.productImage.product.isActive &&
      coverRecord.productImage.product.deletedAt === null
        ? coverRecord.productImage
        : null;
    const assigned = coverRecord?.homepageMedia ?? validProductCover;
    const fallback = category.products[0]?.images[0] ?? null;
    return {
      cover:
        assigned && coverRecord
          ? {
              mediaRef: coverRecord.productImageId
                ? `product:${coverRecord.productImageId}`
                : coverRecord.homepageMediaId,
              url: assigned?.url ?? null,
              altText: coverRecord.altText,
              focalPoint: coverRecord.focalPoint,
              source: coverRecord.productImageId ? 'PRODUCT' : 'HOMEPAGE',
            }
          : null,
      resolved: assigned
        ? {
            url: assigned.url,
            altText: coverRecord!.altText,
            focalPoint: coverRecord!.focalPoint,
            source: 'CATEGORY_COVER',
          }
        : fallback
          ? {
              url: fallback.url,
              altText: fallback.altText,
              focalPoint: 'center',
              source: 'PRODUCT_FALLBACK',
            }
          : {
              url: null,
              altText: `${category.name} rental equipment`,
              focalPoint: 'center',
              source: 'DEFAULT_FALLBACK',
            },
    };
  }

  async assign(
    categoryId: string,
    input: CategoryCoverInput,
    actorUserId: string,
  ) {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${categoryId}))`;
        await this.requirePermissions(tx, actorUserId);
        const category = await tx.category.findFirst({
          where: { id: categoryId, deletedAt: null },
          select: { id: true },
        });
        if (!category) throw new NotFoundException('Category not found');
        const source = split(input.mediaRef);
        if (source.homepageMediaId) {
          const exists = await tx.homepageMedia.count({
            where: { id: source.homepageMediaId },
          });
          if (!exists)
            throw new UnprocessableEntityException('Image is unavailable');
        } else {
          const exists = await tx.productImage.count({
            where: {
              id: source.productImageId,
              product: {
                categoryId,
                isActive: true,
                deletedAt: null,
                category: { isActive: true, deletedAt: null },
              },
            },
          });
          if (!exists)
            throw new UnprocessableEntityException(
              'Choose an active product image from this category',
            );
        }
        await tx.categoryCover.upsert({
          where: { categoryId },
          update: {
            homepageMediaId: source.homepageMediaId ?? null,
            productImageId: source.productImageId ?? null,
            altText: input.altText,
            focalPoint: input.focalPoint,
            updatedByUserId: actorUserId,
          },
          create: {
            categoryId,
            homepageMediaId: source.homepageMediaId ?? null,
            productImageId: source.productImageId ?? null,
            altText: input.altText,
            focalPoint: input.focalPoint,
            updatedByUserId: actorUserId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(categoryId);
  }

  async remove(categoryId: string, actorUserId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${categoryId}))`;
      await this.requirePermissions(tx, actorUserId);
      const category = await tx.category.findFirst({
        where: { id: categoryId, deletedAt: null },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Category not found');
      await tx.categoryCover.deleteMany({ where: { categoryId } });
    });
    return { status: 'removed' as const };
  }

  private async requirePermissions(
    tx: Prisma.TransactionClient,
    actorUserId: string,
  ) {
    const permissionCount = await tx.permission.count({
      where: {
        key: { in: ['category.update', 'homepage.media.manage'] },
        roles: {
          some: {
            role: {
              users: {
                some: {
                  userId: actorUserId,
                  user: { status: UserStatus.ACTIVE },
                },
              },
            },
          },
        },
      },
    });
    if (permissionCount !== 2)
      throw new ForbiddenException('Insufficient permissions');
  }
}
