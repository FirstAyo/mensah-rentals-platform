import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  PublicPageKey as DatabasePublicPageKey,
  PublicPageRevisionKind,
  UserStatus,
  prisma,
} from '@mensah-rentals/database';
import type {
  PublicPageAdminDetail,
  PublicPageAdminListResponse,
  PublicPageAdminRevision,
  PublishedPublicPageResponse,
} from '@mensah-rentals/types';
import {
  DEFAULT_PUBLIC_PAGE_CONTENT,
  DEFAULT_PUBLIC_PAGE_SEO,
  parsePublicPageContent,
  publicAboutPageContentSchema,
  publicContactPageContentSchema,
  publicLegalPageContentSchema,
  publishedPublicPageSeoSchema,
  type PublicPageKey,
  type PublicPageMutationInput,
  type PublicPageSeo,
  type SavePublicPageDraftInput,
} from '@mensah-rentals/validation';

type MediaValue = {
  mediaRef: string | null;
  altText: string;
  focalPoint: 'left' | 'center' | 'right';
};

type Placement = Omit<MediaValue, 'mediaRef'> & {
  slotKey: string;
  mediaRef: string;
};

const LABELS: Record<PublicPageKey, string> = {
  ABOUT: 'About',
  CONTACT: 'Contact',
  TERMS: 'Terms',
  PRIVACY: 'Privacy',
};

const revisionInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  publishedBy: { select: { id: true, firstName: true, lastName: true } },
  mediaPlacements: {
    include: {
      media: {
        select: {
          id: true,
          url: true,
          originalFilename: true,
          description: true,
          width: true,
          height: true,
          byteSize: true,
        },
      },
      productImage: {
        select: {
          id: true,
          url: true,
          altText: true,
          product: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.PublicPageRevisionInclude;

type IncludedRevision = Prisma.PublicPageRevisionGetPayload<{
  include: typeof revisionInclude;
}>;

@Injectable()
export class PublicPagesService {
  async list(): Promise<PublicPageAdminListResponse> {
    await this.ensureAllPages();
    const pages = await prisma.publicPage.findMany({
      include: {
        draftRevision: { select: { version: true } },
        publishedRevision: {
          select: { version: true, publishedAt: true },
        },
      },
      orderBy: { key: 'asc' },
    });
    return {
      items: pages.map((page) => ({
        key: page.key,
        label: LABELS[page.key],
        lockVersion: page.lockVersion,
        draftVersion: page.draftRevision?.version ?? null,
        publishedVersion: page.publishedRevision?.version ?? 0,
        publishedAt: page.publishedRevision?.publishedAt?.toISOString() ?? null,
      })),
    };
  }

  async detail(key: PublicPageKey): Promise<PublicPageAdminDetail> {
    await this.ensurePage(key);
    const page = await prisma.publicPage.findUnique({
      where: { key },
      include: {
        draftRevision: { include: revisionInclude },
        publishedRevision: { include: revisionInclude },
        revisions: {
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            publishedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { version: 'desc' },
          take: 50,
        },
      },
    });
    if (!page?.publishedRevision)
      throw new NotFoundException('Public page is unavailable');
    return {
      key,
      label: LABELS[key],
      lockVersion: page.lockVersion,
      draft: page.draftRevision
        ? this.adminRevision(page.draftRevision, key)
        : null,
      published: this.adminRevision(page.publishedRevision, key),
      revisions: page.revisions.map((revision) => ({
        id: revision.id,
        version: revision.version,
        status: revision.kind,
        createdAt: revision.createdAt.toISOString(),
        publishedAt: revision.publishedAt?.toISOString() ?? null,
        createdBy: revision.createdBy,
        publishedBy: revision.publishedBy,
      })),
    };
  }

  async published(key: PublicPageKey): Promise<PublishedPublicPageResponse> {
    await this.ensurePage(key);
    const page = await prisma.publicPage.findUnique({
      where: { key },
      include: { publishedRevision: { include: revisionInclude } },
    });
    if (!page?.publishedRevision)
      throw new NotFoundException('Public page is unavailable');
    return this.publicRevision(key, page.publishedRevision);
  }

  async preview(key: PublicPageKey, revisionId: string) {
    await this.ensurePage(key);
    const revision = await prisma.publicPageRevision.findFirst({
      where: { id: revisionId, page: { key } },
      include: revisionInclude,
    });
    if (!revision) throw new NotFoundException('Page revision not found');
    return this.publicRevision(key, revision);
  }

  async saveDraft(
    key: PublicPageKey,
    input: SavePublicPageDraftInput,
    actorUserId: string,
  ): Promise<PublicPageAdminDetail> {
    const content = parsePublicPageContent(key, input.content);
    const seo = DEFAULT_PUBLIC_PAGE_SEO[key]
      ? (input.seo satisfies PublicPageSeo)
      : input.seo;
    const placements = this.placements({ content, seo });
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`public-page:${key}`}))`;
        await this.requireActorPermission(tx, actorUserId, 'public_pages.edit');
        const page = await this.requirePage(tx, key);
        const payloadHash = this.hash({ key, content, seo });
        const replay = await tx.publicPageRevision.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          if (replay.payloadHash !== payloadHash)
            throw new ConflictException('Operation ID was already used');
          return;
        }
        if (page.lockVersion !== input.expectedLockVersion)
          throw new ConflictException(
            'This page was updated by another user. Refresh before saving.',
          );
        await this.validatePlacements(tx, placements);
        const version = await this.nextVersion(tx, page.id);
        const revision = await tx.publicPageRevision.create({
          data: {
            pageId: page.id,
            version,
            kind: PublicPageRevisionKind.DRAFT,
            content: content as Prisma.InputJsonValue,
            seo: seo as Prisma.InputJsonValue,
            basedOnRevisionId: page.draftRevisionId ?? page.publishedRevisionId,
            operationId: input.operationId,
            payloadHash,
            createdByUserId: actorUserId,
            mediaPlacements: { create: this.placementData(placements) },
          },
        });
        await tx.publicPage.update({
          where: { id: page.id },
          data: { draftRevisionId: revision.id, lockVersion: { increment: 1 } },
        });
        await this.audit(tx, {
          action: 'PUBLIC_PAGE_DRAFT_SAVED',
          actorUserId,
          key,
          revisionId: revision.id,
          version,
          operationId: input.operationId,
          payloadHash,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.detail(key);
  }

  async publish(
    key: PublicPageKey,
    revisionId: string,
    input: PublicPageMutationInput,
    actorUserId: string,
  ): Promise<PublicPageAdminDetail> {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`public-page:${key}`}))`;
        await this.requireActorPermission(
          tx,
          actorUserId,
          'public_pages.publish',
        );
        const page = await this.requirePage(tx, key);
        const payloadHash = this.hash({ key, revisionId, action: 'publish' });
        const replay = await tx.publicPageRevision.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          if (replay.payloadHash !== payloadHash)
            throw new ConflictException('Operation ID was already used');
          return;
        }
        const draft = await tx.publicPageRevision.findFirst({
          where: { id: revisionId, pageId: page.id, kind: 'DRAFT' },
          include: { mediaPlacements: true },
        });
        if (!draft || page.draftRevisionId !== draft.id)
          throw new ConflictException(
            'Only the current draft can be published',
          );
        if (page.lockVersion !== input.expectedLockVersion)
          throw new ConflictException(
            'This page was updated by another user. Refresh before publishing.',
          );
        const version = await this.nextVersion(tx, page.id);
        const published = await tx.publicPageRevision.create({
          data: {
            pageId: page.id,
            version,
            kind: 'PUBLISHED',
            content: draft.content as Prisma.InputJsonValue,
            seo: draft.seo as Prisma.InputJsonValue,
            basedOnRevisionId: draft.id,
            operationId: input.operationId,
            payloadHash,
            createdByUserId: actorUserId,
            publishedByUserId: actorUserId,
            publishedAt: new Date(),
            mediaPlacements: {
              create: draft.mediaPlacements.map((placement) => ({
                slotKey: placement.slotKey,
                mediaId: placement.mediaId,
                productImageId: placement.productImageId,
                altText: placement.altText,
                focalPoint: placement.focalPoint,
              })),
            },
          },
        });
        await tx.publicPage.update({
          where: { id: page.id },
          data: {
            draftRevisionId: null,
            publishedRevisionId: published.id,
            lockVersion: { increment: 1 },
          },
        });
        await this.audit(tx, {
          action: 'PUBLIC_PAGE_PUBLISHED',
          actorUserId,
          key,
          revisionId: published.id,
          version,
          operationId: input.operationId,
          payloadHash,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.detail(key);
  }

  async restore(
    key: PublicPageKey,
    revisionId: string,
    input: PublicPageMutationInput,
    actorUserId: string,
  ): Promise<PublicPageAdminDetail> {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`public-page:${key}`}))`;
        await this.requireActorPermission(
          tx,
          actorUserId,
          'public_pages.publish',
        );
        const page = await this.requirePage(tx, key);
        const source = await tx.publicPageRevision.findFirst({
          where: { id: revisionId, pageId: page.id, kind: 'PUBLISHED' },
          include: { mediaPlacements: true },
        });
        if (!source)
          throw new NotFoundException('Published revision not found');
        const payloadHash = this.hash({ key, revisionId, action: 'restore' });
        const replay = await tx.publicPageRevision.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          if (replay.payloadHash !== payloadHash)
            throw new ConflictException('Operation ID was already used');
          return;
        }
        if (page.lockVersion !== input.expectedLockVersion)
          throw new ConflictException(
            'This page was updated by another user. Refresh before restoring.',
          );
        const version = await this.nextVersion(tx, page.id);
        const restored = await tx.publicPageRevision.create({
          data: {
            pageId: page.id,
            version,
            kind: 'PUBLISHED',
            content: source.content as Prisma.InputJsonValue,
            seo: source.seo as Prisma.InputJsonValue,
            basedOnRevisionId: page.publishedRevisionId,
            restoredFromRevisionId: source.id,
            operationId: input.operationId,
            payloadHash,
            createdByUserId: actorUserId,
            publishedByUserId: actorUserId,
            publishedAt: new Date(),
            mediaPlacements: {
              create: source.mediaPlacements.map((placement) => ({
                slotKey: placement.slotKey,
                mediaId: placement.mediaId,
                productImageId: placement.productImageId,
                altText: placement.altText,
                focalPoint: placement.focalPoint,
              })),
            },
          },
        });
        await tx.publicPage.update({
          where: { id: page.id },
          data: {
            draftRevisionId: null,
            publishedRevisionId: restored.id,
            lockVersion: { increment: 1 },
          },
        });
        await this.audit(tx, {
          action: 'PUBLIC_PAGE_REVISION_RESTORED',
          actorUserId,
          key,
          revisionId: restored.id,
          version,
          operationId: input.operationId,
          payloadHash,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.detail(key);
  }

  private async ensureAllPages() {
    for (const key of Object.keys(LABELS) as PublicPageKey[])
      await this.ensurePage(key);
  }

  private async ensurePage(key: PublicPageKey) {
    if (await prisma.publicPage.findUnique({ where: { key } })) return;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`public-page-bootstrap:${key}`}))`;
      if (await tx.publicPage.findUnique({ where: { key } })) return;
      const content = structuredClone(DEFAULT_PUBLIC_PAGE_CONTENT[key]);
      const seo = structuredClone(DEFAULT_PUBLIC_PAGE_SEO[key]);
      const references = await this.bootstrapMediaRefs(tx);
      this.assignBootstrapMedia(key, content, seo, references);
      const page = await tx.publicPage.create({
        data: { key: key as DatabasePublicPageKey },
      });
      const placements = this.placements({ content, seo });
      const revision = await tx.publicPageRevision.create({
        data: {
          pageId: page.id,
          version: 1,
          kind: 'PUBLISHED',
          content: content as Prisma.InputJsonValue,
          seo: seo as Prisma.InputJsonValue,
          publishedAt: new Date(),
          mediaPlacements: { create: this.placementData(placements) },
        },
      });
      await tx.publicPage.update({
        where: { id: page.id },
        data: { publishedRevisionId: revision.id },
      });
    });
  }

  private async bootstrapMediaRefs(tx: Prisma.TransactionClient) {
    const [homepage, products] = await Promise.all([
      tx.homepageMedia.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
      tx.productImage.findMany({
        where: {
          product: {
            isActive: true,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);
    return [
      ...homepage.map((item) => item.id),
      ...products.map((item) => `product:${item.id}`),
    ];
  }

  private assignBootstrapMedia(
    key: PublicPageKey,
    content: Record<string, unknown>,
    seo: PublicPageSeo,
    refs: string[],
  ) {
    if (!refs.length) return;
    const set = (target: unknown, index: number) => {
      if (target && typeof target === 'object' && 'mediaRef' in target)
        (target as MediaValue).mediaRef = refs[index % refs.length]!;
    };
    const asRecord = (value: unknown): Record<string, unknown> | undefined =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    const property = (value: unknown, name: string): unknown =>
      asRecord(value)?.[name];
    const record = content;
    set(
      property(property(record, 'hero'), 'image'),
      key === 'ABOUT' ? 0 : key === 'CONTACT' ? 1 : key === 'TERMS' ? 2 : 3,
    );
    set(
      seo.socialImage,
      key === 'ABOUT' ? 0 : key === 'CONTACT' ? 1 : key === 'TERMS' ? 2 : 3,
    );
    if (key === 'ABOUT') {
      set(property(property(record, 'introduction'), 'image'), 1);
      const audienceItems = property(property(record, 'audiences'), 'items');
      if (Array.isArray(audienceItems)) {
        audienceItems.forEach((item, index) =>
          set(property(item, 'image'), index + 2),
        );
      }
      set(property(property(record, 'statement'), 'image'), 6);
    }
    if (key === 'CONTACT')
      set(property(property(record, 'formSupport'), 'image'), 4);
  }

  private placements(value: { content: unknown; seo: PublicPageSeo }) {
    const output: Placement[] = [];
    const visit = (input: unknown, path: string) => {
      if (Array.isArray(input)) {
        input.forEach((item, index) => visit(item, `${path}.${index}`));
        return;
      }
      if (!input || typeof input !== 'object') return;
      const record = input as Record<string, unknown>;
      if (
        'mediaRef' in record &&
        'altText' in record &&
        'focalPoint' in record
      ) {
        const media = record as MediaValue;
        if (media.mediaRef)
          output.push({
            slotKey: path,
            mediaRef: media.mediaRef,
            altText: media.altText,
            focalPoint: media.focalPoint,
          });
        return;
      }
      Object.entries(record).forEach(([key, nested]) =>
        visit(nested, path ? `${path}.${key}` : key),
      );
    };
    visit(value.content, 'content');
    visit(value.seo, 'seo');
    return output;
  }

  private placementData(placements: Placement[]) {
    return placements.map((placement) => ({
      slotKey: placement.slotKey,
      mediaId: placement.mediaRef.startsWith('product:')
        ? null
        : placement.mediaRef,
      productImageId: placement.mediaRef.startsWith('product:')
        ? placement.mediaRef.slice('product:'.length)
        : null,
      altText: placement.altText,
      focalPoint: placement.focalPoint,
    }));
  }

  private async validatePlacements(
    tx: Prisma.TransactionClient,
    placements: Placement[],
  ) {
    const refs = placements.map((placement) => placement.mediaRef);
    if (new Set(refs).size > 30)
      throw new UnprocessableEntityException('Too many page images');
    const homepageIds = refs.filter((ref) => !ref.startsWith('product:'));
    const productIds = refs
      .filter((ref) => ref.startsWith('product:'))
      .map((ref) => ref.slice('product:'.length));
    const [homepageCount, productCount] = await Promise.all([
      tx.homepageMedia.count({ where: { id: { in: homepageIds } } }),
      tx.productImage.count({
        where: {
          id: { in: productIds },
          product: {
            isActive: true,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
          },
        },
      }),
    ]);
    if (
      homepageCount !== new Set(homepageIds).size ||
      productCount !== new Set(productIds).size
    )
      throw new UnprocessableEntityException(
        'Page content references unavailable media',
      );
  }

  private publicRevision(
    key: PublicPageKey,
    revision: IncludedRevision,
  ): PublishedPublicPageResponse {
    const urls = new Map(
      revision.mediaPlacements.map((placement) => [
        placement.slotKey,
        placement.media?.url ?? placement.productImage?.url ?? null,
      ]),
    );
    const resolve = (input: unknown, path: string): unknown => {
      if (Array.isArray(input))
        return input.map((item, index) => resolve(item, `${path}.${index}`));
      if (!input || typeof input !== 'object') return input;
      const record = input as Record<string, unknown>;
      if ('mediaRef' in record && 'altText' in record && 'focalPoint' in record)
        return {
          altText: record.altText,
          focalPoint: record.focalPoint,
          imageUrl: urls.get(path) ?? null,
        };
      return Object.fromEntries(
        Object.entries(record).map(([childKey, nested]) => [
          childKey,
          resolve(nested, path ? `${path}.${childKey}` : childKey),
        ]),
      );
    };
    const content = resolve(revision.content, 'content');
    const seo = publishedPublicPageSeoSchema.parse(
      resolve(revision.seo, 'seo'),
    );
    const common = {
      seo,
      publishedAt: revision.publishedAt?.toISOString() ?? null,
    };
    if (key === 'ABOUT')
      return {
        key,
        content: publicAboutPageContentSchema.parse(content),
        ...common,
      };
    if (key === 'CONTACT')
      return {
        key,
        content: publicContactPageContentSchema.parse(content),
        ...common,
      };
    return {
      key,
      content: publicLegalPageContentSchema.parse(content),
      ...common,
    };
  }

  private adminRevision(revision: IncludedRevision, key: PublicPageKey) {
    return {
      id: revision.id,
      version: revision.version,
      status: revision.kind,
      content: parsePublicPageContent(key, revision.content),
      seo: DEFAULT_PUBLIC_PAGE_SEO[key]
        ? (revision.seo as PublicPageSeo)
        : DEFAULT_PUBLIC_PAGE_SEO[key],
      media: this.adminMedia(revision),
      createdAt: revision.createdAt.toISOString(),
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      createdBy: revision.createdBy,
      publishedBy: revision.publishedBy,
    };
  }

  private adminMedia(
    revision: IncludedRevision,
  ): PublicPageAdminRevision['media'] {
    const items = new Map<string, PublicPageAdminRevision['media'][number]>();
    for (const placement of revision.mediaPlacements) {
      if (placement.media)
        items.set(placement.media.id, {
          id: placement.media.id,
          mediaRef: placement.media.id,
          source: 'HOMEPAGE',
          url: placement.media.url,
          label: placement.media.originalFilename,
          description: placement.media.description,
          width: placement.media.width,
          height: placement.media.height,
          byteSize: placement.media.byteSize,
          usageCount: 0,
          productName: null,
        });
      if (placement.productImage)
        items.set(`product:${placement.productImage.id}`, {
          id: placement.productImage.id,
          mediaRef: `product:${placement.productImage.id}`,
          source: 'PRODUCT',
          url: placement.productImage.url,
          label: placement.productImage.altText,
          description: placement.productImage.altText,
          width: null,
          height: null,
          byteSize: null,
          usageCount: 0,
          productName: placement.productImage.product.name,
        });
    }
    return [...items.values()];
  }

  private async requirePage(tx: Prisma.TransactionClient, key: PublicPageKey) {
    const page = await tx.publicPage.findUnique({ where: { key } });
    if (!page) throw new NotFoundException('Public page not found');
    return page;
  }

  private async nextVersion(tx: Prisma.TransactionClient, pageId: string) {
    const latest = await tx.publicPageRevision.aggregate({
      where: { pageId },
      _max: { version: true },
    });
    return (latest._max.version ?? 0) + 1;
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
    event: {
      action: string;
      actorUserId: string;
      key: PublicPageKey;
      revisionId: string;
      version: number;
      operationId: string;
      payloadHash: string;
    },
  ) {
    await tx.platformAuditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        domain: 'CONTENT',
        action: event.action,
        entityType: 'PublicPageRevision',
        entityId: event.revisionId,
        entityReference: event.key,
        summary: `${LABELS[event.key]} page revision ${event.version} recorded.`,
        metadata: {
          pageKey: event.key,
          revision: event.version,
          operationId: event.operationId,
          payloadHash: event.payloadHash,
        },
        sourceType: 'PublicPage',
        sourceId: event.key,
        sourceKey: `public-page:${event.operationId}`,
      },
    });
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
