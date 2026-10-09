import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, UserStatus, prisma } from '@mensah-rentals/database';
import type { CategoryPresentationInput } from '@mensah-rentals/validation';

function split(reference: string) {
  return reference.startsWith('product:')
    ? { productImageId: reference.slice('product:'.length) }
    : { homepageMediaId: reference };
}

@Injectable()
export class CategoryPresentationService {
  async get(categoryId: string) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: {
        id: true,
        supportingVisuals: {
          include: { homepageMedia: true, productImage: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return {
      items: category.supportingVisuals.flatMap((visual) => {
        const source = visual.homepageMedia ?? visual.productImage;
        return source
          ? [
              {
                mediaRef: visual.productImageId
                  ? `product:${visual.productImageId}`
                  : visual.homepageMediaId!,
                source: visual.productImageId
                  ? ('PRODUCT' as const)
                  : ('HOMEPAGE' as const),
                url: source.url,
                altText: visual.altText,
                focalPoint: visual.focalPoint,
                isDecorative: visual.isDecorative,
                sortOrder: visual.sortOrder,
              },
            ]
          : [];
      }),
    };
  }

  async replace(
    categoryId: string,
    input: CategoryPresentationInput,
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
        const sources = input.items.map((item) => split(item.mediaRef));
        for (const source of sources) {
          if (source.homepageMediaId) {
            if (
              !(await tx.homepageMedia.count({
                where: { id: source.homepageMediaId },
              }))
            )
              throw new UnprocessableEntityException('Image is unavailable');
          } else if (
            !(await tx.productImage.count({
              where: {
                id: source.productImageId,
                product: { categoryId, isActive: true, deletedAt: null },
              },
            }))
          ) {
            throw new UnprocessableEntityException(
              'Choose active product images from this category',
            );
          }
        }
        await tx.categorySupportingVisual.deleteMany({ where: { categoryId } });
        if (input.items.length)
          await tx.categorySupportingVisual.createMany({
            data: input.items.map((item, sortOrder) => ({
              categoryId,
              sortOrder,
              ...sources[sortOrder],
              altText: item.isDecorative ? '' : item.altText,
              focalPoint: item.focalPoint,
              isDecorative: item.isDecorative,
              updatedByUserId: actorUserId,
            })),
          });
        await tx.platformAuditEvent.create({
          data: {
            action: 'CATEGORY_PRESENTATION_UPDATED',
            actorUserId,
            domain: 'CATALOGUE',
            entityId: categoryId,
            entityType: 'Category',
            metadata: { supportingVisualCount: input.items.length },
            summary: 'Category supporting visuals updated',
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(categoryId);
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
