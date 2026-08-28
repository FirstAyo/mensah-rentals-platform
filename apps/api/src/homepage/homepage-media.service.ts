import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus, prisma } from '@mensah-rentals/database';
import type { Prisma } from '@mensah-rentals/database';
import type {
  ApiEnvironment,
  HomepageMediaLibraryQuery,
} from '@mensah-rentals/validation';

import { ProductMediaService } from '../media/product-media.service';

@Injectable()
export class HomepageMediaService {
  private readonly root: string;

  constructor(
    config: ConfigService<ApiEnvironment, true>,
    private readonly productMedia: ProductMediaService,
  ) {
    this.root = resolve(
      __dirname,
      '../../../..',
      config.get('MEDIA_STORAGE_ROOT', { infer: true }),
    );
  }

  async upload(
    source: Buffer,
    originalFilename: string,
    description: string,
    actorUserId: string,
    permission = 'homepage.media.manage',
  ) {
    const normalized = await this.productMedia.normalizeImage(source);
    const contentHash = createHash('sha256')
      .update(normalized.data)
      .digest('hex');
    const mediaId = this.cuidLike();
    const filename = `${contentHash}.webp`;
    const directory = resolve(this.root, 'homepage', mediaId);
    const diskPath = resolve(directory, filename);
    const url = `/media/homepage/${mediaId}/${filename}`;
    let createdFile = false;
    try {
      const media = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contentHash}))`;
        await this.requireActorPermission(tx, actorUserId, permission);
        const duplicate = await tx.homepageMedia.findUnique({
          where: { contentHash },
        });
        if (duplicate) return duplicate;
        await mkdir(directory, { recursive: true });
        try {
          await writeFile(diskPath, normalized.data, { flag: 'wx' });
          createdFile = true;
        } catch (error) {
          if (!this.isAlreadyExists(error)) throw error;
        }
        const created = await tx.homepageMedia.create({
          data: {
            id: mediaId,
            contentHash,
            url,
            width: normalized.info.width,
            height: normalized.info.height,
            byteSize: normalized.data.byteLength,
            format: 'webp',
            description,
            originalFilename: originalFilename.slice(0, 255),
            createdByUserId: actorUserId,
          },
        });
        await this.recordActivity(tx, actorUserId, 'MEDIA_UPLOADED', {
          mediaId: created.id,
          contentHash: created.contentHash,
        });
        return created;
      });
      return this.map(media);
    } catch (error) {
      if (createdFile) await unlink(diskPath).catch(() => undefined);
      throw error;
    }
  }

  async remove(id: string, actorUserId: string) {
    const removedUrl = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      await this.requireActorPermission(
        tx,
        actorUserId,
        'homepage.media.manage',
      );
      const media = await tx.homepageMedia.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              placements: true,
              homepageCategoryOverrides: true,
              categoryCovers: true,
              publicPagePlacements: true,
            },
          },
        },
      });
      if (!media) throw new NotFoundException('Homepage image not found');
      if (
        media._count.placements > 0 ||
        media._count.homepageCategoryOverrides > 0 ||
        media._count.categoryCovers > 0 ||
        media._count.publicPagePlacements > 0
      )
        throw new ConflictException(
          'This image is used by homepage history and cannot be removed',
        );
      await tx.homepageMedia.delete({ where: { id } });
      await this.recordActivity(tx, actorUserId, 'MEDIA_REMOVED', {
        mediaId: media.id,
        contentHash: media.contentHash,
      });
      return media.url;
    });
    const diskPath = this.pathForPublicUrl(removedUrl);
    if (diskPath) await unlink(diskPath).catch(() => undefined);
    return { status: 'deleted' as const };
  }

  async list() {
    const media = await prisma.homepageMedia.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return media.map((item) => this.map(item));
  }

  async listLibrary(query: HomepageMediaLibraryQuery) {
    const homepageWhere: Prisma.HomepageMediaWhereInput = query.search
      ? {
          OR: [
            {
              originalFilename: { contains: query.search, mode: 'insensitive' },
            },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const productWhere: Prisma.ProductImageWhereInput = {
      product: {
        isActive: true,
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
      },
      ...(query.search
        ? {
            OR: [
              { altText: { contains: query.search, mode: 'insensitive' } },
              {
                product: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [homepage, product] = await prisma.$transaction([
      prisma.homepageMedia.findMany({
        where: homepageWhere,
        include: {
          _count: {
            select: {
              placements: true,
              homepageCategoryOverrides: true,
              categoryCovers: true,
              publicPagePlacements: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
      prisma.productImage.findMany({
        where: productWhere,
        include: {
          product: { select: { name: true, slug: true } },
          _count: {
            select: {
              homepagePlacements: true,
              homepageCategoryOverrides: true,
              categoryCovers: true,
              publicPagePlacements: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
    ]);
    const items = [
      ...(query.source === 'PRODUCT' ? [] : homepage).map((item) => ({
        id: item.id,
        mediaRef: item.id,
        source: 'HOMEPAGE' as const,
        url: item.url,
        label: item.originalFilename,
        description: item.description,
        width: item.width,
        height: item.height,
        byteSize: item.byteSize,
        usageCount:
          item._count.placements +
          item._count.homepageCategoryOverrides +
          item._count.categoryCovers +
          item._count.publicPagePlacements,
        productName: null,
      })),
      ...(query.source === 'HOMEPAGE' ? [] : product).map((item) => ({
        id: item.id,
        mediaRef: `product:${item.id}`,
        source: 'PRODUCT' as const,
        url: item.url,
        label: item.altText,
        description: item.altText,
        width: null,
        height: null,
        byteSize: null,
        usageCount:
          item._count.homepagePlacements +
          item._count.homepageCategoryOverrides +
          item._count.categoryCovers +
          item._count.publicPagePlacements,
        productName: item.product.name,
      })),
    ];
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / query.pageSize)),
    };
  }

  async read(id: string, filename: string, requirePublished = true) {
    if (!/^[a-f0-9]{64}\.webp$/.test(filename))
      throw new NotFoundException('Image not found');
    const url = `/media/homepage/${id}/${filename}`;
    const media = await prisma.homepageMedia.findFirst({
      where: {
        id,
        url,
        ...(requirePublished
          ? {
              OR: [
                {
                  placements: {
                    some: {
                      revision: {
                        publishedHeadOf: { is: { id: 'primary' } },
                      },
                    },
                  },
                },
                {
                  homepageCategoryOverrides: {
                    some: {
                      revision: {
                        publishedHeadOf: { is: { id: 'primary' } },
                      },
                    },
                  },
                },
                {
                  categoryCovers: {
                    some: {
                      category: { isActive: true, deletedAt: null },
                    },
                  },
                },
                {
                  publicPagePlacements: {
                    some: {
                      revision: { publishedHeadOf: { isNot: null } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    if (!media) throw new NotFoundException('Image not found');
    try {
      return await readFile(resolve(this.root, 'homepage', id, filename));
    } catch {
      throw new NotFoundException('Image not found');
    }
  }

  private map(media: Prisma.HomepageMediaGetPayload<Record<string, never>>) {
    return {
      id: media.id,
      url: media.url,
      width: media.width,
      height: media.height,
      byteSize: media.byteSize,
      format: media.format,
      description: media.description,
      originalFilename: media.originalFilename,
      createdAt: media.createdAt.toISOString(),
    };
  }

  private async requireActorPermission(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    permission: string,
  ) {
    const actor = await tx.user.findFirst({
      where: {
        id: actorUserId,
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            role: {
              permissions: { some: { permission: { key: permission } } },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException('Insufficient permissions');
  }

  private async recordActivity(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    type: 'MEDIA_UPLOADED' | 'MEDIA_REMOVED',
    details: Prisma.InputJsonObject,
  ) {
    await tx.homepageSite.upsert({
      where: { id: 'primary' },
      update: {},
      create: { id: 'primary' },
    });
    await tx.homepageActivity.create({
      data: { homepageId: 'primary', actorUserId, type, details },
    });
  }

  private pathForPublicUrl(url: string) {
    const match = /^\/media\/homepage\/([a-z0-9]+)\/([a-f0-9]{64}\.webp)$/.exec(
      url,
    );
    return match ? resolve(this.root, 'homepage', match[1]!, match[2]!) : null;
  }

  private cuidLike() {
    return `cmhp${Date.now().toString(36)}${createHash('sha256').update(randomUUID()).digest('hex').slice(0, 14)}`;
  }

  private isAlreadyExists(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EEXIST'
    );
  }
}
