import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { prisma } from '@mensah-rentals/database';
import { beforeAll, describe, expect, it } from 'vitest';

import { GalleryService } from './gallery.service';

describe('Gallery immutable publication against PostgreSQL', () => {
  const service = new GalleryService();
  const suffix = randomUUID().slice(0, 8);
  let actorId: string;
  let mediaId: string;

  beforeAll(async () => {
    for (const key of [
      'gallery.edit',
      'gallery.publish',
      'gallery.view',
      'gallery.preview',
    ]) {
      await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: `Test ${key}` },
      });
    }
    const role = await prisma.role.create({
      data: {
        name: `GALLERY_TEST_${suffix.toUpperCase()}`,
        displayName: 'Gallery test',
        permissions: {
          create: (
            await prisma.permission.findMany({
              where: { key: { startsWith: 'gallery.' } },
              select: { id: true },
            })
          ).map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    const actor = await prisma.user.create({
      data: {
        email: `gallery-${suffix}@example.test`,
        firstName: 'Gallery',
        lastName: 'Test',
        passwordHash: 'not-used-in-this-test',
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    actorId = actor.id;
    const media = await prisma.homepageMedia.create({
      data: {
        id: `cmgp${Date.now().toString(36)}abcdef123456`,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        url: `/media/homepage/gallery${suffix}/${'a'.repeat(64)}.webp`,
        width: 1600,
        height: 1000,
        byteSize: 1000,
        format: 'webp',
        description: 'Gallery test image',
        originalFilename: 'gallery.webp',
        createdByUserId: actor.id,
      },
    });
    mediaId = media.id;
  });

  it('keeps drafts private and supports audited, idempotent unpublish without deleting history', async () => {
    const createInput = {
      operationId: randomUUID(),
      content: {
        slug: `film-project-${suffix}`,
        title: `Film project ${suffix}`,
        serviceType: 'FILM_PRODUCTION' as const,
        shortDescription: 'A safely published production project.',
        description: 'Public project detail.',
        eventDate: '2026-08-10',
        location: 'Richmond, British Columbia',
        featured: true,
        sortOrder: 1,
        seoTitle: null,
        seoDescription: null,
      },
      media: [
        {
          mediaId,
          altText: 'Equipment supporting a production',
          focalPoint: 'center' as const,
        },
      ],
    };
    const created = await service.create(createInput, actorId);
    expect(created.draft?.version).toBe(1);
    expect(created.published).toBe(false);
    expect((await service.publicList({})).items).not.toContainEqual(
      expect.objectContaining({ slug: createInput.content.slug }),
    );

    const replay = await service.create(createInput, actorId);
    expect(replay.id).toBe(created.id);
    await expect(
      service.create(
        {
          ...createInput,
          content: { ...createInput.content, title: 'Changed replay' },
        },
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const published = await service.publish(
      created.id,
      created.draft!.id,
      { expectedLockVersion: created.lockVersion, operationId: randomUUID() },
      actorId,
    );
    expect(published.published).toBe(true);
    const publicList = await service.publicList({
      event: createInput.content.slug,
      page: 1,
      pageSize: 24,
    });
    expect(publicList.photos).toHaveLength(1);
    expect(publicList.photos[0]).toMatchObject({
      event: { slug: createInput.content.slug },
      image: { height: 1000, width: 1600 },
    });
    expect(publicList.meta).toMatchObject({ hasMore: false, total: 1 });
    expect(JSON.stringify(publicList)).not.toMatch(
      /mediaId|revision|actor|inventory|permission|operationId|payloadHash/i,
    );
    const detail = await service.publicDetail(createInput.content.slug);
    expect(detail.title).toBe(createInput.content.title);
    expect(detail.media).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toMatch(
      /mediaId|revision|actor|inventory|permission|operationId|payloadHash/i,
    );
    const revisionCount = await prisma.galleryProjectRevision.count({
      where: { galleryProjectId: created.id },
    });
    expect(revisionCount).toBe(2);

    const unpublishInput = {
      expectedLockVersion: published.lockVersion,
      operationId: randomUUID(),
    };
    const unpublished = await service.unpublish(
      created.id,
      unpublishInput,
      actorId,
    );
    expect(unpublished.published).toBe(false);
    expect(unpublished.publishedRevision).toBeNull();
    expect(unpublished.draft?.content).toEqual(
      published.publishedRevision?.content,
    );
    expect(unpublished.draft?.media).toEqual(
      published.publishedRevision?.media,
    );
    await expect(
      service.publicDetail(createInput.content.slug),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await prisma.galleryProjectRevision.count({
        where: { galleryProjectId: created.id },
      }),
    ).toBe(revisionCount + 1);
    expect(
      await prisma.galleryProjectRevision.findUnique({
        where: { id: published.publishedRevision!.id },
        select: { kind: true, publishedAt: true },
      }),
    ).toEqual({
      kind: 'PUBLISHED',
      publishedAt: expect.any(Date),
    });
    expect(
      await prisma.platformAuditEvent.findUnique({
        where: { sourceKey: `gallery:${unpublishInput.operationId}` },
        select: { action: true },
      }),
    ).toEqual({ action: 'GALLERY_PROJECT_UNPUBLISHED' });

    const unpublishReplay = await service.unpublish(
      created.id,
      unpublishInput,
      actorId,
    );
    expect(unpublishReplay.lockVersion).toBe(unpublished.lockVersion);
    await expect(
      service.archive(
        created.id,
        {
          expectedLockVersion: unpublished.lockVersion,
          operationId: unpublishInput.operationId,
        },
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const edited = await service.saveDraft(
      created.id,
      {
        ...createInput,
        operationId: randomUUID(),
        expectedLockVersion: unpublished.lockVersion,
        content: {
          ...createInput.content,
          title: `Updated unpublished project ${suffix}`,
        },
      },
      actorId,
    );
    expect(edited.draft?.content.title).toBe(
      `Updated unpublished project ${suffix}`,
    );
    expect(edited.publishedRevision).toBeNull();

    const archived = await service.archive(
      created.id,
      {
        expectedLockVersion: edited.lockVersion,
        operationId: randomUUID(),
      },
      actorId,
    );
    expect(archived.archivedAt).not.toBeNull();
    await expect(
      service.publicDetail(createInput.content.slug),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await prisma.galleryProjectRevision.count({
        where: { galleryProjectId: created.id },
      }),
    ).toBe(revisionCount + 2);
  });

  it('suffixes automatic collisions, rejects manual collisions, and publishes atomically', async () => {
    const content = {
      slug: `automatic-gallery-${suffix}`,
      title: `Automatic Gallery ${suffix}`,
      serviceType: 'EVENTS_FESTIVALS' as const,
      shortDescription: 'An automatically named Gallery project.',
      description: null,
      eventDate: null,
      location: null,
      featured: false,
      sortOrder: 2,
      seoTitle: null,
      seoDescription: null,
    };
    const media = [
      {
        mediaId,
        altText: 'Rental equipment at an event',
        focalPoint: 'center' as const,
      },
    ];
    const first = await service.createAndPublish(
      {
        operationId: randomUUID(),
        slugMode: 'AUTO',
        content,
        media,
      },
      actorId,
    );
    expect(first.published).toBe(true);
    expect(first.draft).toBeNull();
    expect(first.history.map(({ kind }) => kind)).toEqual([
      'PUBLISHED',
      'DRAFT',
    ]);
    expect(await service.publicDetail(first.slug)).toMatchObject({
      slug: first.slug,
      title: content.title,
    });

    const second = await service.createAndPublish(
      {
        operationId: randomUUID(),
        slugMode: 'AUTO',
        content,
        media,
      },
      actorId,
    );
    expect(second.slug).toBe(`${first.slug}-2`);

    await expect(
      service.create(
        {
          operationId: randomUUID(),
          slugMode: 'MANUAL',
          content: { ...content, title: 'Manual collision' },
          media,
        },
        actorId,
      ),
    ).rejects.toThrow(
      'This Gallery URL is already being used by another Gallery project.',
    );
  });
});
