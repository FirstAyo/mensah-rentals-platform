import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, UserStatus, prisma } from '@mensah-rentals/database';
import type {
  AdminGalleryListResponse,
  AdminGalleryProjectResponse,
  AdminGalleryProjectSummaryResponse,
  AdminGalleryRevisionResponse,
  PublicGalleryProjectResponse,
  PublicGalleryProjectSummaryResponse,
  PublicGalleryPhotoResponse,
  PublicGalleryResponse,
} from '@mensah-rentals/types';
import {
  GALLERY_SERVICE_PRESENTATION,
  createGallerySlug,
  gallerySlugWithSuffix,
  galleryServiceTypeFromSlug,
  type CreateGalleryProjectInput,
  type GalleryAdminListQuery,
  type GalleryMutationInput,
  type GalleryProjectContentInput,
  type PublicGalleryQuery,
  type SaveGalleryDraftInput,
} from '@mensah-rentals/validation';

const GALLERY_LOCK = 2_026_091_119;

const revisionInclude = {
  media: {
    orderBy: [{ sortOrder: 'asc' as const }],
    include: { media: true },
  },
} satisfies Prisma.GalleryProjectRevisionInclude;

type IncludedRevision = Prisma.GalleryProjectRevisionGetPayload<{
  include: typeof revisionInclude;
}>;

function payloadHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class GalleryService {
  async publicList(query: PublicGalleryQuery): Promise<PublicGalleryResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const serviceType = query.type
      ? galleryServiceTypeFromSlug(query.type)
      : undefined;
    const revisions = await prisma.galleryProjectRevision.findMany({
      where: {
        ...(serviceType ? { serviceType } : {}),
        publishedHeadOf: {
          is: {
            archivedAt: null,
            ...(query.event ? { slug: query.event } : {}),
          },
        },
      },
      include: revisionInclude,
      orderBy: [
        { featured: 'desc' },
        { sortOrder: 'asc' },
        { publishedAt: 'desc' },
        { id: 'asc' },
      ],
    });
    const photos = this.interleavedPhotos(
      revisions,
      `gallery-v1:${query.type ?? 'all'}:${query.event ?? 'all'}`,
    );
    const start = (page - 1) * pageSize;
    const totalPages = photos.length ? Math.ceil(photos.length / pageSize) : 0;
    return {
      items: revisions.map((revision) => this.publicSummary(revision)),
      meta: {
        hasMore: page < totalPages,
        page,
        pageSize,
        total: photos.length,
        totalPages,
      },
      photos: photos.slice(start, start + pageSize),
      selectedEvent: query.event ?? null,
      selectedType: query.type ?? null,
      services: Object.values(GALLERY_SERVICE_PRESENTATION),
    };
  }

  async publicDetail(slug: string): Promise<PublicGalleryProjectResponse> {
    const project = await prisma.galleryProject.findFirst({
      where: { slug, archivedAt: null, publishedRevisionId: { not: null } },
      select: {
        publishedRevision: { include: revisionInclude },
      },
    });
    if (!project?.publishedRevision)
      throw new NotFoundException('Gallery project was not found');
    return this.publicRevision(project.publishedRevision);
  }

  async adminList(
    query: GalleryAdminListQuery,
  ): Promise<AdminGalleryListResponse> {
    const where: Prisma.GalleryProjectWhereInput = {
      ...(query.serviceType
        ? {
            OR: [
              { draftRevision: { is: { serviceType: query.serviceType } } },
              {
                draftRevisionId: null,
                publishedRevision: {
                  is: { serviceType: query.serviceType },
                },
              },
            ],
          }
        : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { slug: { contains: query.search, mode: 'insensitive' } },
                  {
                    draftRevision: {
                      is: {
                        title: { contains: query.search, mode: 'insensitive' },
                      },
                    },
                  },
                  {
                    publishedRevision: {
                      is: {
                        title: { contains: query.search, mode: 'insensitive' },
                      },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
      ...(query.state === 'ARCHIVED'
        ? { archivedAt: { not: null } }
        : query.state === 'DRAFT'
          ? { archivedAt: null, draftRevisionId: { not: null } }
          : query.state === 'PUBLISHED'
            ? { archivedAt: null, publishedRevisionId: { not: null } }
            : {}),
    };
    const include = {
      draftRevision: { include: revisionInclude },
      publishedRevision: { include: revisionInclude },
    } satisfies Prisma.GalleryProjectInclude;
    const [items, total] = await prisma.$transaction([
      prisma.galleryProject.findMany({
        where,
        include,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.galleryProject.count({ where }),
    ]);
    return {
      items: items.map((project) => this.adminSummary(project)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async adminDetail(id: string): Promise<AdminGalleryProjectResponse> {
    const project = await prisma.galleryProject.findUnique({
      where: { id },
      include: {
        draftRevision: { include: revisionInclude },
        publishedRevision: { include: revisionInclude },
        revisions: {
          include: revisionInclude,
          orderBy: [{ version: 'desc' }, { id: 'desc' }],
          take: 50,
        },
      },
    });
    if (!project) throw new NotFoundException('Gallery project was not found');
    return {
      ...this.adminSummary(project),
      draft: project.draftRevision
        ? this.adminRevision(project.draftRevision)
        : null,
      publishedRevision: project.publishedRevision
        ? this.adminRevision(project.publishedRevision)
        : null,
      history: project.revisions.map((revision) =>
        this.adminRevision(revision),
      ),
    };
  }

  async create(input: CreateGalleryProjectInput, actorUserId: string) {
    const hash = payloadHash({ action: 'CREATE', ...input });
    const projectId = await this.mutate(async (tx) => {
      await this.requireActorPermission(tx, actorUserId, 'gallery.edit');
      const replay = await tx.galleryProjectRevision.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) return this.replayRevision(replay, hash);
      await this.validateMedia(
        tx,
        input.media.map(({ mediaId }) => mediaId),
      );
      const slug = await this.resolveSlug(
        tx,
        input.content.slug,
        input.content.title,
        input.slugMode ?? 'MANUAL',
      );
      const project = await tx.galleryProject.create({
        data: {
          slug,
          createdByUserId: actorUserId,
        },
      });
      const revision = await tx.galleryProjectRevision.create({
        data: {
          galleryProjectId: project.id,
          version: 1,
          kind: 'DRAFT',
          ...this.revisionFields({ ...input.content, slug }),
          operationId: input.operationId,
          payloadHash: hash,
          createdByUserId: actorUserId,
          media: { create: this.mediaRows(input.media) },
        },
      });
      await tx.galleryProject.update({
        where: { id: project.id },
        data: { draftRevisionId: revision.id, lockVersion: { increment: 1 } },
      });
      await this.audit(tx, {
        action: 'GALLERY_PROJECT_CREATED',
        actorUserId,
        operationId: input.operationId,
        hash,
        projectId: project.id,
        slug,
      });
      return project.id;
    });
    return this.adminDetail(projectId);
  }

  async createAndPublish(
    input: CreateGalleryProjectInput,
    actorUserId: string,
  ) {
    const hash = payloadHash({ action: 'CREATE_AND_PUBLISH', ...input });
    const projectId = await this.mutate(async (tx) => {
      await this.requireActorPermission(tx, actorUserId, 'gallery.edit');
      await this.requireActorPermission(tx, actorUserId, 'gallery.publish');
      const replay = await tx.galleryProjectRevision.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) return this.replayRevision(replay, hash);
      await this.validateMedia(
        tx,
        input.media.map(({ mediaId }) => mediaId),
      );
      const slug = await this.resolveSlug(
        tx,
        input.content.slug,
        input.content.title,
        input.slugMode ?? 'MANUAL',
      );
      const project = await tx.galleryProject.create({
        data: { slug, createdByUserId: actorUserId },
      });
      const draft = await tx.galleryProjectRevision.create({
        data: {
          galleryProjectId: project.id,
          version: 1,
          kind: 'DRAFT',
          ...this.revisionFields({ ...input.content, slug }),
          createdByUserId: actorUserId,
          media: { create: this.mediaRows(input.media) },
        },
      });
      const published = await tx.galleryProjectRevision.create({
        data: {
          galleryProjectId: project.id,
          version: 2,
          kind: 'PUBLISHED',
          ...this.revisionFields({ ...input.content, slug }),
          basedOnRevisionId: draft.id,
          operationId: input.operationId,
          payloadHash: hash,
          createdByUserId: actorUserId,
          publishedByUserId: actorUserId,
          publishedAt: new Date(),
          media: { create: this.mediaRows(input.media) },
        },
      });
      await tx.galleryProject.update({
        where: { id: project.id },
        data: { publishedRevisionId: published.id, lockVersion: 1 },
      });
      await this.audit(tx, {
        action: 'GALLERY_PROJECT_CREATED_AND_PUBLISHED',
        actorUserId,
        operationId: input.operationId,
        hash,
        projectId: project.id,
        slug,
      });
      return project.id;
    });
    return this.adminDetail(projectId);
  }

  async saveDraft(
    id: string,
    input: SaveGalleryDraftInput,
    actorUserId: string,
  ) {
    const hash = payloadHash({ action: 'SAVE_DRAFT', projectId: id, ...input });
    const projectId = await this.mutate(async (tx) => {
      await this.requireActorPermission(tx, actorUserId, 'gallery.edit');
      const replay = await tx.galleryProjectRevision.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) return this.replayRevision(replay, hash, id);
      const project = await this.lockProject(tx, id);
      this.assertEditable(project.archivedAt);
      if (project.lockVersion !== input.expectedLockVersion)
        throw new ConflictException(
          'Gallery project changed. Reload and try again.',
        );
      await this.validateMedia(
        tx,
        input.media.map(({ mediaId }) => mediaId),
      );
      const slug = await this.resolveSlug(
        tx,
        input.content.slug,
        input.content.title,
        input.slugMode ?? 'MANUAL',
        id,
      );
      const latest = await tx.galleryProjectRevision.aggregate({
        where: { galleryProjectId: id },
        _max: { version: true },
      });
      const revision = await tx.galleryProjectRevision.create({
        data: {
          galleryProjectId: id,
          version: (latest._max.version ?? 0) + 1,
          kind: 'DRAFT',
          ...this.revisionFields({ ...input.content, slug }),
          basedOnRevisionId:
            project.draftRevisionId ?? project.publishedRevisionId,
          operationId: input.operationId,
          payloadHash: hash,
          createdByUserId: actorUserId,
          media: { create: this.mediaRows(input.media) },
        },
      });
      await tx.galleryProject.update({
        where: { id },
        data: { draftRevisionId: revision.id, lockVersion: { increment: 1 } },
      });
      await this.audit(tx, {
        action: 'GALLERY_DRAFT_SAVED',
        actorUserId,
        operationId: input.operationId,
        hash,
        projectId: id,
        slug,
      });
      return id;
    });
    return this.adminDetail(projectId);
  }

  async saveAndPublish(
    id: string,
    input: SaveGalleryDraftInput,
    actorUserId: string,
  ) {
    const hash = payloadHash({
      action: 'SAVE_AND_PUBLISH',
      projectId: id,
      ...input,
    });
    const projectId = await this.mutate(async (tx) => {
      await this.requireActorPermission(tx, actorUserId, 'gallery.edit');
      await this.requireActorPermission(tx, actorUserId, 'gallery.publish');
      const replay = await tx.galleryProjectRevision.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) return this.replayRevision(replay, hash, id);
      const project = await this.lockProject(tx, id);
      this.assertEditable(project.archivedAt);
      if (project.lockVersion !== input.expectedLockVersion)
        throw new ConflictException(
          'Gallery project changed. Reload and try again.',
        );
      await this.validateMedia(
        tx,
        input.media.map(({ mediaId }) => mediaId),
      );
      const slug = await this.resolveSlug(
        tx,
        input.content.slug,
        input.content.title,
        input.slugMode ?? 'MANUAL',
        id,
      );
      const latest = await tx.galleryProjectRevision.aggregate({
        where: { galleryProjectId: id },
        _max: { version: true },
      });
      const draftVersion = (latest._max.version ?? 0) + 1;
      const draft = await tx.galleryProjectRevision.create({
        data: {
          galleryProjectId: id,
          version: draftVersion,
          kind: 'DRAFT',
          ...this.revisionFields({ ...input.content, slug }),
          basedOnRevisionId:
            project.draftRevisionId ?? project.publishedRevisionId,
          createdByUserId: actorUserId,
          media: { create: this.mediaRows(input.media) },
        },
      });
      const published = await tx.galleryProjectRevision.create({
        data: {
          galleryProjectId: id,
          version: draftVersion + 1,
          kind: 'PUBLISHED',
          ...this.revisionFields({ ...input.content, slug }),
          basedOnRevisionId: draft.id,
          operationId: input.operationId,
          payloadHash: hash,
          createdByUserId: actorUserId,
          publishedByUserId: actorUserId,
          publishedAt: new Date(),
          media: { create: this.mediaRows(input.media) },
        },
      });
      await tx.galleryProject.update({
        where: { id },
        data: {
          slug,
          draftRevisionId: null,
          publishedRevisionId: published.id,
          lockVersion: { increment: 1 },
        },
      });
      await this.audit(tx, {
        action: 'GALLERY_DRAFT_SAVED_AND_PUBLISHED',
        actorUserId,
        operationId: input.operationId,
        hash,
        projectId: id,
        slug,
      });
      return id;
    });
    return this.adminDetail(projectId);
  }

  async publish(
    id: string,
    revisionId: string,
    input: GalleryMutationInput,
    actorUserId: string,
  ) {
    const hash = payloadHash({ action: 'PUBLISH', projectId: id, revisionId });
    const projectId = await this.mutate(async (tx) => {
      await this.requireActorPermission(tx, actorUserId, 'gallery.publish');
      const replay = await tx.galleryProjectRevision.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) return this.replayRevision(replay, hash, id);
      const project = await this.lockProject(tx, id);
      this.assertEditable(project.archivedAt);
      if (project.lockVersion !== input.expectedLockVersion)
        throw new ConflictException(
          'Gallery project changed. Reload and try again.',
        );
      if (project.draftRevisionId !== revisionId)
        throw new ConflictException('Only the current draft can be published');
      const source = await tx.galleryProjectRevision.findFirst({
        where: { id: revisionId, galleryProjectId: id, kind: 'DRAFT' },
        include: revisionInclude,
      });
      if (!source) throw new NotFoundException('Gallery draft was not found');
      await this.validateMedia(
        tx,
        source.media.map(({ mediaId }) => mediaId),
      );
      const latest = await tx.galleryProjectRevision.aggregate({
        where: { galleryProjectId: id },
        _max: { version: true },
      });
      const published = await tx.galleryProjectRevision.create({
        data: {
          galleryProjectId: id,
          version: (latest._max.version ?? 0) + 1,
          kind: 'PUBLISHED',
          slugSnapshot: source.slugSnapshot,
          title: source.title,
          serviceType: source.serviceType,
          shortDescription: source.shortDescription,
          description: source.description,
          eventDate: source.eventDate,
          location: source.location,
          featured: source.featured,
          sortOrder: source.sortOrder,
          seoTitle: source.seoTitle,
          seoDescription: source.seoDescription,
          basedOnRevisionId: source.id,
          operationId: input.operationId,
          payloadHash: hash,
          createdByUserId: actorUserId,
          publishedByUserId: actorUserId,
          publishedAt: new Date(),
          media: {
            create: source.media.map((item) => ({
              mediaId: item.mediaId,
              altText: item.altText,
              focalPoint: item.focalPoint,
              sortOrder: item.sortOrder,
            })),
          },
        },
      });
      await tx.galleryProject.update({
        where: { id },
        data: {
          slug: source.slugSnapshot,
          draftRevisionId: null,
          publishedRevisionId: published.id,
          lockVersion: { increment: 1 },
        },
      });
      await this.audit(tx, {
        action: 'GALLERY_PROJECT_PUBLISHED',
        actorUserId,
        operationId: input.operationId,
        hash,
        projectId: id,
        slug: source.slugSnapshot,
      });
      return id;
    });
    return this.adminDetail(projectId);
  }

  async archive(id: string, input: GalleryMutationInput, actorUserId: string) {
    const hash = payloadHash({ action: 'ARCHIVE', projectId: id });
    const projectId = await this.mutate(async (tx) => {
      await this.requireActorPermission(tx, actorUserId, 'gallery.publish');
      const sourceKey = `gallery:${input.operationId}`;
      const replay = await tx.platformAuditEvent.findUnique({
        where: { sourceKey },
      });
      if (replay) {
        const metadata = replay.metadata as { payloadHash?: string } | null;
        if (metadata?.payloadHash !== hash || replay.entityId !== id)
          throw new ConflictException(
            'Operation ID was already used for a different Gallery change',
          );
        return id;
      }
      const project = await this.lockProject(tx, id);
      if (project.lockVersion !== input.expectedLockVersion)
        throw new ConflictException(
          'Gallery project changed. Reload and try again.',
        );
      if (project.archivedAt)
        throw new ConflictException('Gallery project is already archived');
      await tx.galleryProject.update({
        where: { id },
        data: { archivedAt: new Date(), lockVersion: { increment: 1 } },
      });
      await this.audit(tx, {
        action: 'GALLERY_PROJECT_ARCHIVED',
        actorUserId,
        operationId: input.operationId,
        hash,
        projectId: id,
        slug: project.slug,
      });
      return id;
    });
    return this.adminDetail(projectId);
  }

  async unpublish(
    id: string,
    input: GalleryMutationInput,
    actorUserId: string,
  ) {
    const hash = payloadHash({ action: 'UNPUBLISH', projectId: id });
    const projectId = await this.mutate(async (tx) => {
      await this.requireActorPermission(tx, actorUserId, 'gallery.publish');
      const sourceKey = `gallery:${input.operationId}`;
      const replay = await tx.platformAuditEvent.findUnique({
        where: { sourceKey },
      });
      if (replay) {
        const metadata = replay.metadata as { payloadHash?: string } | null;
        if (metadata?.payloadHash !== hash || replay.entityId !== id)
          throw new ConflictException(
            'Operation ID was already used for a different Gallery change',
          );
        return id;
      }

      const project = await this.lockProject(tx, id);
      this.assertEditable(project.archivedAt);
      if (project.lockVersion !== input.expectedLockVersion)
        throw new ConflictException(
          'Gallery project changed. Reload and try again.',
        );
      if (!project.publishedRevisionId)
        throw new ConflictException('Gallery project is not published');

      let draftRevisionId = project.draftRevisionId;
      if (!draftRevisionId) {
        const source = await tx.galleryProjectRevision.findFirst({
          where: {
            id: project.publishedRevisionId,
            galleryProjectId: id,
            kind: 'PUBLISHED',
          },
          include: revisionInclude,
        });
        if (!source)
          throw new ConflictException(
            'The published Gallery revision is unavailable',
          );
        const latest = await tx.galleryProjectRevision.aggregate({
          where: { galleryProjectId: id },
          _max: { version: true },
        });
        const draft = await tx.galleryProjectRevision.create({
          data: {
            galleryProjectId: id,
            version: (latest._max.version ?? 0) + 1,
            kind: 'DRAFT',
            slugSnapshot: source.slugSnapshot,
            title: source.title,
            serviceType: source.serviceType,
            shortDescription: source.shortDescription,
            description: source.description,
            eventDate: source.eventDate,
            location: source.location,
            featured: source.featured,
            sortOrder: source.sortOrder,
            seoTitle: source.seoTitle,
            seoDescription: source.seoDescription,
            basedOnRevisionId: source.id,
            operationId: input.operationId,
            payloadHash: hash,
            createdByUserId: actorUserId,
            media: {
              create: source.media.map((item) => ({
                mediaId: item.mediaId,
                altText: item.altText,
                focalPoint: item.focalPoint,
                sortOrder: item.sortOrder,
              })),
            },
          },
        });
        draftRevisionId = draft.id;
      }

      await tx.galleryProject.update({
        where: { id },
        data: {
          draftRevisionId,
          publishedRevisionId: null,
          lockVersion: { increment: 1 },
        },
      });
      await this.audit(tx, {
        action: 'GALLERY_PROJECT_UNPUBLISHED',
        actorUserId,
        operationId: input.operationId,
        hash,
        projectId: id,
        slug: project.slug,
      });
      return id;
    });
    return this.adminDetail(projectId);
  }

  async preview(id: string, revisionId: string) {
    const revision = await prisma.galleryProjectRevision.findFirst({
      where: { id: revisionId, galleryProjectId: id },
      include: revisionInclude,
    });
    if (!revision)
      throw new NotFoundException('Gallery revision was not found');
    return this.publicRevision(revision);
  }

  private publicSummary(
    revision: IncludedRevision,
  ): PublicGalleryProjectSummaryResponse {
    const cover = revision.media[0];
    if (!cover) throw new NotFoundException('Gallery project has no media');
    const service = GALLERY_SERVICE_PRESENTATION[revision.serviceType];
    return {
      eventDate: this.dateString(revision.eventDate),
      imageCount: revision.media.length,
      location: revision.location,
      cover: this.publicMedia(cover),
      service,
      shortDescription: revision.shortDescription,
      slug: revision.slugSnapshot,
      title: revision.title,
    };
  }

  private publicRevision(
    revision: IncludedRevision,
  ): PublicGalleryProjectResponse {
    return {
      ...this.publicSummary(revision),
      description: revision.description,
      media: revision.media.map((item) => this.publicMedia(item)),
      seo: {
        title: revision.seoTitle || revision.title,
        description: revision.seoDescription || revision.shortDescription,
      },
    };
  }

  private publicMedia(item: IncludedRevision['media'][number]) {
    if (!item.media.url.startsWith('/media/homepage/'))
      throw new NotFoundException('Gallery image was not found');
    return {
      altText: item.altText,
      focalPoint: item.focalPoint,
      height: item.media.height,
      url: item.media.url,
      width: item.media.width,
    };
  }

  private interleavedPhotos(
    revisions: IncludedRevision[],
    seed: string,
  ): PublicGalleryPhotoResponse[] {
    const projects = [...revisions].sort((left, right) =>
      this.stableRank(seed, left.slugSnapshot).localeCompare(
        this.stableRank(seed, right.slugSnapshot),
      ),
    );
    const seenMedia = new Set<string>();
    const photos: PublicGalleryPhotoResponse[] = [];
    const longest = Math.max(0, ...projects.map((item) => item.media.length));

    for (let mediaIndex = 0; mediaIndex < longest; mediaIndex += 1) {
      for (const revision of projects) {
        const item = revision.media[mediaIndex];
        if (!item || seenMedia.has(item.mediaId)) continue;
        seenMedia.add(item.mediaId);
        photos.push({
          event: {
            shortDescription: revision.shortDescription,
            slug: revision.slugSnapshot,
            title: revision.title,
          },
          eventImageCount: revision.media.length,
          eventImageIndex: mediaIndex + 1,
          image: this.publicMedia(item),
          key: `${revision.slugSnapshot}-${item.sortOrder + 1}`,
          service: GALLERY_SERVICE_PRESENTATION[revision.serviceType],
        });
      }
    }
    return photos;
  }

  private stableRank(seed: string, value: string) {
    return createHash('sha256').update(`${seed}:${value}`).digest('hex');
  }

  private adminSummary(project: {
    id: string;
    slug: string;
    lockVersion: number;
    archivedAt: Date | null;
    updatedAt: Date;
    draftRevision: IncludedRevision | null;
    publishedRevision: IncludedRevision | null;
  }): AdminGalleryProjectSummaryResponse {
    const current = project.draftRevision ?? project.publishedRevision;
    return {
      archivedAt: project.archivedAt?.toISOString() ?? null,
      coverUrl: current?.media[0]?.media.url ?? null,
      id: project.id,
      imageCount: current?.media.length ?? 0,
      lockVersion: project.lockVersion,
      publishedAt:
        project.publishedRevision?.publishedAt?.toISOString() ?? null,
      published: Boolean(project.publishedRevision && !project.archivedAt),
      serviceType: current?.serviceType ?? 'FILM_PRODUCTION',
      slug: current?.slugSnapshot ?? project.slug,
      title: current?.title ?? project.slug,
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private adminRevision(
    revision: IncludedRevision,
  ): AdminGalleryRevisionResponse {
    return {
      content: {
        slug: revision.slugSnapshot,
        title: revision.title,
        serviceType: revision.serviceType,
        shortDescription: revision.shortDescription,
        description: revision.description,
        eventDate: this.dateString(revision.eventDate),
        location: revision.location,
        featured: revision.featured,
        sortOrder: revision.sortOrder,
        seoTitle: revision.seoTitle,
        seoDescription: revision.seoDescription,
      },
      createdAt: revision.createdAt.toISOString(),
      id: revision.id,
      kind: revision.kind,
      media: revision.media.map((item) => ({
        altText: item.altText,
        focalPoint: item.focalPoint,
        mediaId: item.mediaId,
        url: item.media.url,
      })),
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      version: revision.version,
    };
  }

  private async resolveSlug(
    tx: Prisma.TransactionClient,
    requestedSlug: string,
    title: string,
    mode: 'AUTO' | 'MANUAL',
    excludeProjectId?: string,
  ) {
    if (mode === 'MANUAL') {
      if (
        await this.slugBelongsToAnotherProject(
          tx,
          requestedSlug,
          excludeProjectId,
        )
      )
        throw new ConflictException(
          'This Gallery URL is already being used by another Gallery project.',
        );
      return requestedSlug;
    }

    const base = createGallerySlug(title);
    if (!base)
      throw new UnprocessableEntityException(
        'Enter a title containing letters or numbers so a valid URL can be created.',
      );

    if (!(await this.slugBelongsToAnotherProject(tx, base, excludeProjectId)))
      return base;

    for (let suffix = 2; suffix <= 10_000; suffix += 1) {
      const candidate = gallerySlugWithSuffix(base, suffix);
      if (
        !(await this.slugBelongsToAnotherProject(
          tx,
          candidate,
          excludeProjectId,
        ))
      )
        return candidate;
    }
    throw new ConflictException('A unique Gallery URL could not be created.');
  }

  private async slugBelongsToAnotherProject(
    tx: Prisma.TransactionClient,
    slug: string,
    excludeProjectId?: string,
  ) {
    return Boolean(
      await tx.galleryProject.findFirst({
        where: {
          ...(excludeProjectId ? { id: { not: excludeProjectId } } : {}),
          OR: [
            { slug },
            { draftRevision: { is: { slugSnapshot: slug } } },
            { publishedRevision: { is: { slugSnapshot: slug } } },
          ],
        },
        select: { id: true },
      }),
    );
  }

  private revisionFields(content: GalleryProjectContentInput) {
    return {
      slugSnapshot: content.slug,
      title: content.title,
      serviceType: content.serviceType,
      shortDescription: content.shortDescription,
      description: content.description,
      eventDate: content.eventDate
        ? new Date(`${content.eventDate}T00:00:00.000Z`)
        : null,
      location: content.location,
      featured: content.featured,
      sortOrder: content.sortOrder,
      seoTitle: content.seoTitle,
      seoDescription: content.seoDescription,
    };
  }

  private mediaRows(
    media: Array<{ mediaId: string; altText: string; focalPoint: string }>,
  ) {
    return media.map((item, sortOrder) => ({ ...item, sortOrder }));
  }

  private async validateMedia(tx: Prisma.TransactionClient, ids: string[]) {
    const count = await tx.homepageMedia.count({ where: { id: { in: ids } } });
    if (count !== ids.length)
      throw new UnprocessableEntityException(
        'Gallery selections contain unavailable managed media',
      );
  }

  private async lockProject(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        slug: string;
        lockVersion: number;
        archivedAt: Date | null;
        draftRevisionId: string | null;
        publishedRevisionId: string | null;
      }>
    >`SELECT "id", "slug", "lockVersion", "archivedAt", "draftRevisionId", "publishedRevisionId"
      FROM "GalleryProject" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException('Gallery project was not found');
    return rows[0];
  }

  private replayRevision(
    revision: { galleryProjectId: string; payloadHash: string | null },
    hash: string,
    expectedProjectId?: string,
  ) {
    if (
      revision.payloadHash !== hash ||
      (expectedProjectId && revision.galleryProjectId !== expectedProjectId)
    )
      throw new ConflictException(
        'Operation ID was already used for a different Gallery change',
      );
    return revision.galleryProjectId;
  }

  private assertEditable(archivedAt: Date | null) {
    if (archivedAt)
      throw new ConflictException(
        'Archived Gallery projects cannot be changed',
      );
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

  private async audit(
    tx: Prisma.TransactionClient,
    input: {
      action: string;
      actorUserId: string;
      operationId: string;
      hash: string;
      projectId: string;
      slug: string;
    },
  ) {
    await tx.platformAuditEvent.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId,
        domain: 'GALLERY',
        entityType: 'GalleryProject',
        entityId: input.projectId,
        entityReference: input.slug,
        summary: `${input.action.replaceAll('_', ' ')}: ${input.slug}`,
        metadata: {
          operationId: input.operationId,
          payloadHash: input.hash,
        },
        sourceKey: `gallery:${input.operationId}`,
        sourceType: input.action,
      },
    });
  }

  private async mutate<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GALLERY_LOCK})`;
          return work(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      )
        throw new ConflictException(
          'Gallery content changed or the slug is already in use.',
        );
      throw error;
    }
  }

  private dateString(value: Date | null) {
    return value?.toISOString().slice(0, 10) ?? null;
  }
}
