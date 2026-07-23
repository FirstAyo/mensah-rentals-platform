import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { prisma } from '@mensah-rentals/database';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ProductMediaService } from './product-media.service';

describe('ProductMediaService', () => {
  let mediaRoot: string;
  let service: ProductMediaService;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'mensah-media-'));
    const config = {
      get: () => mediaRoot,
    } as unknown as ConfigService<ApiEnvironment, true>;
    service = new ProductMediaService(config);
    const suffix = randomUUID().replaceAll('-', '');
    const category = await prisma.category.create({
      data: { name: `Media ${suffix}`, slug: `media-${suffix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: `Media product ${suffix}`,
        slug: `media-product-${suffix}`,
        shortDescription: 'Image processing test product',
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.product.delete({ where: { id: productId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await rm(mediaRoot, { recursive: true, force: true });
  });

  it('resizes and compresses a large valid image within authoritative limits', async () => {
    const source = await sharp({
      create: { width: 6000, height: 4000, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();
    const result = await service.normalizeImage(source);
    expect(result.info.format).toBe('webp');
    expect(Math.max(result.info.width, result.info.height)).toBe(2400);
    expect(result.data.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('does not enlarge a small image', async () => {
    const source = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const result = await service.normalizeImage(source);
    expect([result.info.width, result.info.height]).toEqual([1200, 800]);
  });

  it('rejects source input larger than 10 MB', async () => {
    await expect(
      service.normalizeImage(Buffer.alloc(10 * 1024 * 1024 + 1)),
    ).rejects.toThrow(/10 MB/);
  });

  it('rejects output that remains too large after reasonable compression', async () => {
    const pixels = randomBytes(2400 * 2400 * 3);
    const source = await sharp(pixels, {
      raw: { width: 2400, height: 2400, channels: 3 },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    expect(source.byteLength).toBeLessThan(10 * 1024 * 1024);
    await expect(service.normalizeImage(source)).rejects.toThrow(
      /still too large/,
    );
  }, 15_000);

  it('rejects unsupported SVG content', async () => {
    await expect(
      service.normalizeImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).rejects.toThrow(/valid image|JPEG, PNG, and WebP/);
  });

  it('rejects extension or MIME spoofing because content is inspected', async () => {
    await expect(
      service.normalizeImage(Buffer.from('not really a photo.jpeg')),
    ).rejects.toThrow(/valid image/);
  });

  it('rejects invalid image content when client processing is bypassed', async () => {
    await expect(service.normalizeImage(randomBytes(256))).rejects.toThrow(
      /valid image/,
    );
  });

  it('applies EXIF orientation and removes unnecessary metadata', async () => {
    const source = await sharp({
      create: { width: 80, height: 40, channels: 3, background: '#990000' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await service.normalizeImage(source);
    const metadata = await sharp(result.data).metadata();
    expect([metadata.width, metadata.height]).toEqual([40, 80]);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
  });

  it('associates four normalized images, rejects a fifth, and exposes only public URLs', async () => {
    for (let index = 0; index < 4; index += 1) {
      const source = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 3,
          background: { r: index * 30, g: 100, b: 180 },
        },
      })
        .png()
        .toBuffer();
      const image = await service.upload(
        productId,
        source,
        `Image ${index + 1}`,
      );
      expect(image.url).toMatch(
        new RegExp(`^/media/products/${productId}/[a-f0-9]{64}\\.webp$`),
      );
      expect(image.url).not.toContain(mediaRoot);
    }
    const fifth = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#00ff00' },
    })
      .png()
      .toBuffer();
    await expect(
      service.upload(productId, fifth, 'Fifth image'),
    ).rejects.toThrow(/at most four/);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(4);
  });
});
