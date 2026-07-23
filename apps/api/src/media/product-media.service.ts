import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@mensah-rentals/database';
import type { AdminProductImageResponse } from '@mensah-rentals/types';
import {
  PRODUCT_IMAGE_LIMITS,
  type ApiEnvironment,
  type UpdateProductImageInput,
} from '@mensah-rentals/validation';
import sharp, { type Metadata } from 'sharp';

const IMAGE_QUALITIES = [PRODUCT_IMAGE_LIMITS.compressionQuality, 75, 65];

@Injectable()
export class ProductMediaService {
  private readonly root: string;

  constructor(config: ConfigService<ApiEnvironment, true>) {
    this.root = resolve(
      __dirname,
      '../../../..',
      config.get('MEDIA_STORAGE_ROOT', { infer: true }),
    );
  }

  async normalizeImage(source: Buffer) {
    if (source.byteLength > PRODUCT_IMAGE_LIMITS.maxSourceBytes)
      throw new ConflictException('Image exceeds the 10 MB source limit');
    let metadata: Metadata;
    try {
      metadata = await sharp(source, { failOn: 'error' }).metadata();
    } catch {
      throw new UnsupportedMediaTypeException('File is not a valid image');
    }
    if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format))
      throw new UnsupportedMediaTypeException(
        'Only JPEG, PNG, and WebP images are supported',
      );
    for (const quality of IMAGE_QUALITIES) {
      const result = await sharp(source, { failOn: 'error' })
        .rotate()
        .resize({
          width: PRODUCT_IMAGE_LIMITS.maxDimension,
          height: PRODUCT_IMAGE_LIMITS.maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      if (result.data.byteLength <= PRODUCT_IMAGE_LIMITS.maxProcessedBytes)
        return result;
    }
    throw new ConflictException(
      'This image is still too large after optimization. Please choose a different image.',
    );
  }

  async upload(productId: string, source: Buffer, altText: string) {
    const normalized = await this.normalizeImage(source);
    const hash = createHash('sha256').update(normalized.data).digest('hex');
    const filename = `${hash}.webp`;
    const relativeUrl = `/media/products/${productId}/${filename}`;
    const directory = resolve(this.root, 'products', productId);
    const diskPath = resolve(directory, filename);
    let createdFile = false;
    try {
      const imageId = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
        const product = await tx.product.findUnique({
          where: { id: productId },
        });
        if (!product) throw new NotFoundException('Product not found');
        const existing = await tx.productImage.findFirst({
          where: { productId, url: relativeUrl },
        });
        if (existing) return existing.id;
        const count = await tx.productImage.count({ where: { productId } });
        if (count >= PRODUCT_IMAGE_LIMITS.maxImages)
          throw new ConflictException('A product can have at most four images');
        await mkdir(directory, { recursive: true });
        try {
          await writeFile(diskPath, normalized.data, { flag: 'wx' });
          createdFile = true;
        } catch (error) {
          if (!this.isAlreadyExists(error)) throw error;
        }
        const image = await tx.productImage.create({
          data: {
            productId,
            url: relativeUrl,
            altText,
            isPrimary: count === 0,
            sortOrder: count,
          },
        });
        return image.id;
      });
      return this.getImage(productId, imageId);
    } catch (error) {
      if (createdFile) await unlink(diskPath).catch(() => undefined);
      throw error;
    }
  }

  async update(
    productId: string,
    imageId: string,
    input: UpdateProductImageInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      const image = await tx.productImage.findFirst({
        where: { id: imageId, productId },
      });
      if (!image) throw new NotFoundException('Product image not found');
      if (!input.isPrimary && image.isPrimary) {
        const otherCount = await tx.productImage.count({
          where: { productId, id: { not: imageId } },
        });
        if (otherCount > 0)
          throw new ConflictException('Select another primary image first');
      }
      if (input.isPrimary)
        await tx.productImage.updateMany({
          where: { productId, id: { not: imageId } },
          data: { isPrimary: false },
        });
      await tx.productImage.update({
        where: { id: imageId },
        data: { altText: input.altText, isPrimary: input.isPrimary },
      });
    });
    return this.getImage(productId, imageId);
  }

  async remove(productId: string, imageId: string) {
    const removed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      const image = await tx.productImage.findFirst({
        where: { id: imageId, productId },
      });
      if (!image) throw new NotFoundException('Product image not found');
      await tx.productImage.delete({ where: { id: imageId } });
      if (image.isPrimary) {
        const next = await tx.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        if (next)
          await tx.productImage.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
      }
      return image.url;
    });
    const diskPath = this.pathForPublicUrl(removed);
    if (diskPath) await unlink(diskPath).catch(() => undefined);
    return { status: 'deleted' as const };
  }

  async read(productId: string, filename: string) {
    if (!/^[a-f0-9]{64}\.webp$/.test(filename))
      throw new NotFoundException('Image not found');
    const record = await prisma.productImage.findFirst({
      where: { productId, url: `/media/products/${productId}/${filename}` },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('Image not found');
    try {
      return await readFile(
        resolve(this.root, 'products', productId, filename),
      );
    } catch {
      throw new NotFoundException('Image not found');
    }
  }

  private async getImage(productId: string, imageId: string) {
    const image = await prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) throw new NotFoundException('Product image not found');
    return this.map(image);
  }

  private map(image: {
    altText: string;
    createdAt: Date;
    id: string;
    isPrimary: boolean;
    sortOrder: number;
    url: string;
  }): AdminProductImageResponse {
    return { ...image, createdAt: image.createdAt.toISOString() };
  }

  private pathForPublicUrl(url: string) {
    const match = /^\/media\/products\/([a-z0-9]+)\/([a-f0-9]{64}\.webp)$/.exec(
      url,
    );
    return match ? resolve(this.root, 'products', match[1]!, match[2]!) : null;
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
