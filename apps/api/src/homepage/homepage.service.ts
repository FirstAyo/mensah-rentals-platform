import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, UserStatus, prisma } from '@mensah-rentals/database';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  homepageContentSchema,
  type HomepageMediaReference,
  type HomepageContent,
  type HomepageMutationInput,
  type SaveHomepageDraftInput,
} from '@mensah-rentals/validation';

const HOMEPAGE_ID = 'primary';
const HOMEPAGE_LOCK = 2_026_073_116;

function safeGoogleUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' &&
      (host === 'google.com' ||
        host.endsWith('.google.com') ||
        host === 'goo.gl')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const publicCategoryBaseSelect = {
  description: true,
  name: true,
  slug: true,
} satisfies Prisma.CategorySelect;

const homepageCategorySelect = {
  id: true,
  description: true,
  name: true,
  slug: true,
  cover: {
    include: {
      homepageMedia: true,
      productImage: {
        include: {
          product: {
            select: { categoryId: true, isActive: true, deletedAt: true },
          },
        },
      },
    },
  },
  products: {
    where: { isActive: true, deletedAt: null, images: { some: {} } },
    orderBy: [
      { isFeatured: 'desc' as const },
      { name: 'asc' as const },
      { id: 'asc' as const },
    ],
    take: 1,
    select: {
      images: {
        orderBy: [
          { isPrimary: 'desc' as const },
          { sortOrder: 'asc' as const },
          { id: 'asc' as const },
        ],
        take: 1,
        select: { altText: true, url: true },
      },
    },
  },
} satisfies Prisma.CategorySelect;

const publicProductSelect = {
  category: { select: publicCategoryBaseSelect },
  images: {
    select: { altText: true, isPrimary: true, url: true },
    orderBy: [
      { isPrimary: 'desc' as const },
      { sortOrder: 'asc' as const },
      { id: 'asc' as const },
    ],
    take: 1,
  },
  isFeatured: true,
  name: true,
  rentalUnit: true,
  shortDescription: true,
  slug: true,
} satisfies Prisma.ProductSelect;

type IncludedRevision = Prisma.HomepageRevisionGetPayload<{
  include: {
    featuredCategories: {
      include: {
        coverHomepageMedia: true;
        coverProductImage: true;
      };
    };
    featuredProducts: true;
    mediaPlacements: { include: { media: true; productImage: true } };
  };
}>;
type PublicProduct = Prisma.ProductGetPayload<{
  select: typeof publicProductSelect;
}>;
type PublicHomepageCategory = Prisma.CategoryGetPayload<{
  select: typeof homepageCategorySelect;
}>;

function hashPayload(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

type MediaPlacementInput = {
  slotKey: string;
  sortOrder: number;
  mediaId?: string;
  productImageId?: string;
};

function splitMediaRef(reference: HomepageMediaReference) {
  return reference.startsWith('product:')
    ? { productImageId: reference.slice('product:'.length) }
    : { mediaId: reference };
}

function mediaRef(mediaId: string | null, productImageId: string | null) {
  return productImageId ? `product:${productImageId}` : mediaId;
}

function mediaPlacements(content: HomepageContent): MediaPlacementInput[] {
  const placements: ReadonlyArray<
    readonly [string, HomepageMediaReference | null]
  > = [
    ['seo.social', content.seo.socialImageMediaId],
    ...content.hero.slides.flatMap((slide, index) => [
      [`hero.${index}.desktop`, slide.desktopMediaId] as const,
      [`hero.${index}.mobile`, slide.mobileMediaId] as const,
    ]),
    ...content.solutions.items.map(
      (solution, index) => [`solutions.${index}`, solution.mediaId] as const,
    ),
    ['pickup-delivery', content.pickupDelivery.mediaId],
    ['final-cta', content.finalCta.mediaId],
  ];
  return placements.flatMap(([slotKey, reference], sortOrder) =>
    reference ? [{ slotKey, sortOrder, ...splitMediaRef(reference) }] : [],
  );
}

@Injectable()
export class HomepageService {
  async getPublicHomepage() {
    const site = await prisma.homepageSite.findUnique({
      where: { id: HOMEPAGE_ID },
      select: { publishedRevisionId: true },
    });
    if (!site?.publishedRevisionId) return this.defaultPublicHomepage();
    return this.publicRevision(site.publishedRevisionId);
  }

  async getAdminHomepage(): Promise<unknown> {
    const site = await prisma.homepageSite.findUnique({
      where: { id: HOMEPAGE_ID },
      include: {
        draftRevision: { include: this.revisionInclude() },
        publishedRevision: { include: this.revisionInclude() },
        revisions: {
          orderBy: [{ version: 'desc' }, { id: 'desc' }],
          take: 25,
          select: {
            id: true,
            version: true,
            kind: true,
            createdAt: true,
            publishedAt: true,
            restoredFromRevisionId: true,
          },
        },
      },
    });
    if (!site) {
      return {
        lockVersion: 0,
        draft: null,
        published: null,
        revisions: [],
        defaultContent: DEFAULT_HOMEPAGE_CONTENT,
      };
    }
    return {
      lockVersion: site.lockVersion,
      draft: site.draftRevision ? this.adminRevision(site.draftRevision) : null,
      published: site.publishedRevision
        ? this.adminRevision(site.publishedRevision)
        : null,
      revisions: site.revisions.map((revision) => ({
        ...revision,
        createdAt: revision.createdAt.toISOString(),
        publishedAt: revision.publishedAt?.toISOString() ?? null,
      })),
      defaultContent: DEFAULT_HOMEPAGE_CONTENT,
    };
  }

  async saveDraft(
    input: SaveHomepageDraftInput,
    actorUserId: string,
  ): Promise<unknown> {
    const parsedContent = homepageContentSchema.parse(input.content);
    const featuredCategoryOverrides = input.featuredCategoryOverrides ?? [];
    const payloadHash = hashPayload({
      content: parsedContent,
      featuredCategoryIds: input.featuredCategoryIds,
      featuredCategoryOverrides,
      featuredProductIds: input.featuredProductIds,
    });
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOMEPAGE_LOCK})`;
        await this.requireActorPermission(tx, actorUserId, 'homepage.edit');
        let site = await tx.homepageSite.findUnique({
          where: { id: HOMEPAGE_ID },
        });
        if (!site) {
          site = await tx.homepageSite.create({
            data: { id: HOMEPAGE_ID },
          });
        }
        const prior = await tx.homepageRevision.findUnique({
          where: { operationId: input.operationId },
        });
        if (prior) {
          if (prior.payloadHash !== payloadHash)
            throw new ConflictException(
              'Operation ID was already used for different content',
            );
          return prior.id;
        }
        if (site.lockVersion !== input.expectedLockVersion)
          throw new ConflictException(
            'Homepage content changed. Reload and try again.',
          );
        await this.validateReferences(
          tx,
          input.featuredCategoryIds,
          input.featuredProductIds,
          mediaPlacements(parsedContent),
          featuredCategoryOverrides,
        );
        const latest = await tx.homepageRevision.aggregate({
          where: { homepageId: HOMEPAGE_ID },
          _max: { version: true },
        });
        const revision = await tx.homepageRevision.create({
          data: {
            homepageId: HOMEPAGE_ID,
            version: (latest._max.version ?? 0) + 1,
            kind: 'DRAFT',
            content: parsedContent as Prisma.InputJsonValue,
            basedOnRevisionId: site.draftRevisionId ?? site.publishedRevisionId,
            operationId: input.operationId,
            payloadHash,
            createdByUserId: actorUserId,
            featuredCategories: {
              create: input.featuredCategoryIds.map((categoryId, sortOrder) => {
                const override = featuredCategoryOverrides.find(
                  (item) => item.categoryId === categoryId,
                );
                return {
                  categoryId,
                  sortOrder,
                  coverAltText: override?.altText || null,
                  coverFocalPoint: override?.focalPoint || null,
                  ...(override?.mediaRef
                    ? splitMediaRef(override.mediaRef).productImageId
                      ? {
                          coverProductImageId: splitMediaRef(override.mediaRef)
                            .productImageId,
                        }
                      : {
                          coverHomepageMediaId: splitMediaRef(override.mediaRef)
                            .mediaId,
                        }
                    : {}),
                };
              }),
            },
            featuredProducts: {
              create: input.featuredProductIds.map((productId, sortOrder) => ({
                productId,
                sortOrder,
              })),
            },
            mediaPlacements: {
              create: mediaPlacements(parsedContent),
            },
          },
        });
        await tx.homepageSite.update({
          where: { id: HOMEPAGE_ID },
          data: { draftRevisionId: revision.id, lockVersion: { increment: 1 } },
        });
        await tx.homepageActivity.create({
          data: {
            homepageId: HOMEPAGE_ID,
            revisionId: revision.id,
            actorUserId,
            type: 'DRAFT_CREATED',
          },
        });
        return revision.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.getRevision(result);
  }

  async publish(
    revisionId: string,
    input: HomepageMutationInput,
    actorUserId: string,
  ): Promise<unknown> {
    return this.publishCopy(revisionId, input, actorUserId, false);
  }

  async restore(
    revisionId: string,
    input: HomepageMutationInput,
    actorUserId: string,
  ): Promise<unknown> {
    return this.publishCopy(revisionId, input, actorUserId, true);
  }

  async preview(revisionId: string): Promise<unknown> {
    return this.getRevision(revisionId);
  }

  googleReviewsStatus() {
    return {
      liveReviewsEnabled: false,
      provider: null,
      reason:
        'Live review cards are disabled until a compliant Google provider and credential path is approved.',
      reviewsUrlConfigured: Boolean(
        safeGoogleUrl(process.env.GOOGLE_REVIEWS_URL),
      ),
      writeReviewUrlConfigured: Boolean(
        safeGoogleUrl(process.env.GOOGLE_WRITE_REVIEW_URL),
      ),
    };
  }

  private async publishCopy(
    revisionId: string,
    input: HomepageMutationInput,
    actorUserId: string,
    restore: boolean,
  ) {
    const payloadHash = hashPayload({ revisionId, restore });
    const id = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HOMEPAGE_LOCK})`;
        await this.requireActorPermission(tx, actorUserId, 'homepage.publish');
        const site = await tx.homepageSite.findUnique({
          where: { id: HOMEPAGE_ID },
        });
        if (!site)
          throw new NotFoundException('Homepage has not been configured');
        const prior = await tx.homepageRevision.findUnique({
          where: { operationId: input.operationId },
        });
        if (prior) {
          if (prior.payloadHash !== payloadHash)
            throw new ConflictException(
              'Operation ID was already used for a different publication',
            );
          return prior.id;
        }
        if (site.lockVersion !== input.expectedLockVersion)
          throw new ConflictException(
            'Homepage content changed. Reload and try again.',
          );
        const source = await tx.homepageRevision.findFirst({
          where: {
            id: revisionId,
            homepageId: HOMEPAGE_ID,
            ...(restore ? { kind: 'PUBLISHED' } : {}),
          },
          include: this.revisionInclude(),
        });
        if (!source) throw new NotFoundException('Homepage revision not found');
        if (!restore && site.draftRevisionId !== source.id)
          throw new ConflictException(
            'Only the current draft can be published',
          );
        await this.validateReferences(
          tx,
          source.featuredCategories.map((item) => item.categoryId),
          source.featuredProducts.map((item) => item.productId),
          source.mediaPlacements.map((item) => ({
            slotKey: item.slotKey,
            sortOrder: item.sortOrder,
            ...(item.mediaId ? { mediaId: item.mediaId } : {}),
            ...(item.productImageId
              ? { productImageId: item.productImageId }
              : {}),
          })),
          source.featuredCategories.flatMap((item) => {
            const ref = mediaRef(
              item.coverHomepageMediaId,
              item.coverProductImageId,
            );
            return ref
              ? [
                  {
                    categoryId: item.categoryId,
                    mediaRef: ref,
                    altText: item.coverAltText ?? '',
                    focalPoint:
                      (item.coverFocalPoint as
                        | 'center'
                        | 'top'
                        | 'bottom'
                        | 'left'
                        | 'right') ?? 'center',
                  },
                ]
              : [];
          }),
        );
        const latest = await tx.homepageRevision.aggregate({
          where: { homepageId: HOMEPAGE_ID },
          _max: { version: true },
        });
        const revision = await tx.homepageRevision.create({
          data: {
            homepageId: HOMEPAGE_ID,
            version: (latest._max.version ?? 0) + 1,
            kind: 'PUBLISHED',
            content: source.content as Prisma.InputJsonValue,
            basedOnRevisionId: source.id,
            restoredFromRevisionId: restore ? source.id : null,
            operationId: input.operationId,
            payloadHash,
            createdByUserId: actorUserId,
            publishedByUserId: actorUserId,
            publishedAt: new Date(),
            featuredCategories: {
              create: source.featuredCategories.map(
                ({
                  categoryId,
                  sortOrder,
                  coverHomepageMediaId,
                  coverProductImageId,
                  coverAltText,
                  coverFocalPoint,
                }) => ({
                  categoryId,
                  sortOrder,
                  coverHomepageMediaId,
                  coverProductImageId,
                  coverAltText,
                  coverFocalPoint,
                }),
              ),
            },
            featuredProducts: {
              create: source.featuredProducts.map(
                ({ productId, sortOrder }) => ({ productId, sortOrder }),
              ),
            },
            mediaPlacements: {
              create: source.mediaPlacements.map(
                ({ mediaId, productImageId, slotKey, sortOrder }) => ({
                  mediaId,
                  productImageId,
                  slotKey,
                  sortOrder,
                }),
              ),
            },
          },
        });
        await tx.homepageSite.update({
          where: { id: HOMEPAGE_ID },
          data: {
            publishedRevisionId: revision.id,
            draftRevisionId: restore ? site.draftRevisionId : null,
            lockVersion: { increment: 1 },
          },
        });
        await tx.homepageActivity.create({
          data: {
            homepageId: HOMEPAGE_ID,
            revisionId: revision.id,
            actorUserId,
            type: restore ? 'RESTORED' : 'PUBLISHED',
            details: restore
              ? { restoredFromRevisionId: source.id }
              : undefined,
          },
        });
        return revision.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.getRevision(id);
  }

  private revisionInclude() {
    return {
      featuredCategories: {
        orderBy: [{ sortOrder: 'asc' as const }],
        include: { coverHomepageMedia: true, coverProductImage: true },
      },
      featuredProducts: { orderBy: [{ sortOrder: 'asc' as const }] },
      mediaPlacements: {
        orderBy: [{ sortOrder: 'asc' as const }],
        include: { media: true, productImage: true },
      },
    } satisfies Prisma.HomepageRevisionInclude;
  }

  private async getRevision(id: string) {
    const revision = await prisma.homepageRevision.findUnique({
      where: { id },
      include: this.revisionInclude(),
    });
    if (!revision) throw new NotFoundException('Homepage revision not found');
    return this.adminRevision(revision);
  }

  private adminRevision(revision: IncludedRevision) {
    return {
      id: revision.id,
      version: revision.version,
      kind: revision.kind,
      content: homepageContentSchema.parse(revision.content),
      featuredCategoryIds: revision.featuredCategories.map(
        (item) => item.categoryId,
      ),
      featuredCategoryOverrides: revision.featuredCategories.flatMap((item) => {
        const reference = mediaRef(
          item.coverHomepageMediaId,
          item.coverProductImageId,
        );
        return reference
          ? [
              {
                categoryId: item.categoryId,
                mediaRef: reference,
                altText: item.coverAltText ?? '',
                focalPoint: item.coverFocalPoint ?? 'center',
              },
            ]
          : [];
      }),
      featuredProductIds: revision.featuredProducts.map(
        (item) => item.productId,
      ),
      media: revision.mediaPlacements.map((item) =>
        item.media
          ? {
              id: item.media.id,
              mediaRef: item.media.id,
              source: 'HOMEPAGE',
              url: item.media.url,
              width: item.media.width,
              height: item.media.height,
              byteSize: item.media.byteSize,
              description: item.media.description,
              label: item.media.originalFilename,
              originalFilename: item.media.originalFilename,
              usageCount: 1,
              productName: null,
            }
          : {
              id: `product:${item.productImage!.id}`,
              mediaRef: `product:${item.productImage!.id}`,
              source: 'PRODUCT',
              url: item.productImage!.url,
              width: null,
              height: null,
              byteSize: null,
              description: item.productImage!.altText,
              label: item.productImage!.altText,
              originalFilename: item.productImage!.altText,
              usageCount: 1,
              productName: null,
            },
      ),
      createdAt: revision.createdAt.toISOString(),
      publishedAt: revision.publishedAt?.toISOString() ?? null,
    };
  }

  private async publicRevision(id: string) {
    const revision = await prisma.homepageRevision.findFirst({
      where: { id, kind: 'PUBLISHED' },
      include: {
        featuredCategories: {
          orderBy: [{ sortOrder: 'asc' }],
          where: { category: { isActive: true, deletedAt: null } },
          include: {
            category: { select: homepageCategorySelect },
            coverHomepageMedia: true,
            coverProductImage: true,
          },
        },
        featuredProducts: {
          orderBy: [{ sortOrder: 'asc' }],
          where: {
            product: {
              isActive: true,
              deletedAt: null,
              category: { isActive: true, deletedAt: null },
            },
          },
          include: { product: { select: publicProductSelect } },
        },
        mediaPlacements: {
          include: { media: true, productImage: true },
        },
      },
    });
    if (!revision) return this.defaultPublicHomepage();
    const content = homepageContentSchema.parse(revision.content);
    const allowedMedia = new Map<string, string>();
    for (const placement of revision.mediaPlacements) {
      if (placement.media)
        allowedMedia.set(placement.media.id, placement.media.url);
      if (placement.productImage)
        allowedMedia.set(
          `product:${placement.productImage.id}`,
          placement.productImage.url,
        );
    }
    return {
      content: this.publicContent(content, allowedMedia),
      categories: revision.featuredCategories.map((selection) =>
        this.publicCategory(selection.category, selection),
      ),
      products: revision.featuredProducts.map(({ product }) =>
        this.publicProduct(product),
      ),
      googleReviews: {
        live: false,
        reviewsUrl:
          content.reviews.reviewsUrl ??
          safeGoogleUrl(process.env.GOOGLE_REVIEWS_URL),
        writeReviewUrl:
          content.reviews.writeReviewUrl ??
          safeGoogleUrl(process.env.GOOGLE_WRITE_REVIEW_URL),
      },
    };
  }

  private async defaultPublicHomepage() {
    const [categories, products] = await prisma.$transaction([
      prisma.category.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 6,
        select: homepageCategorySelect,
      }),
      prisma.product.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          category: { isActive: true, deletedAt: null },
        },
        orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
        take: 8,
        select: publicProductSelect,
      }),
    ]);
    return {
      content: this.publicContent(DEFAULT_HOMEPAGE_CONTENT, new Map()),
      categories: categories.map((category) => this.publicCategory(category)),
      products: products.map((product) => this.publicProduct(product)),
      googleReviews: {
        live: false,
        reviewsUrl: safeGoogleUrl(process.env.GOOGLE_REVIEWS_URL),
        writeReviewUrl: safeGoogleUrl(process.env.GOOGLE_WRITE_REVIEW_URL),
      },
    };
  }

  private publicProduct(product: PublicProduct) {
    return {
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      rentalUnit: product.rentalUnit,
      isFeatured: product.isFeatured,
      category: { ...product.category },
      images: product.images.map((image) => ({
        url: image.url,
        altText: image.altText,
        isPrimary: image.isPrimary,
      })),
    };
  }

  private publicCategory(
    category: PublicHomepageCategory,
    override?: {
      coverAltText: string | null;
      coverFocalPoint: string | null;
      coverHomepageMedia: { url: string } | null;
      coverProductImage: { altText: string; url: string } | null;
    },
  ) {
    const overridden =
      override?.coverHomepageMedia ?? override?.coverProductImage;
    const validProductCover =
      category.cover?.productImage?.product.categoryId === category.id &&
      category.cover.productImage.product.isActive &&
      category.cover.productImage.product.deletedAt === null
        ? category.cover.productImage
        : null;
    const cover = category.cover?.homepageMedia ?? validProductCover;
    const fallback = category.products[0]?.images[0] ?? null;
    const source = overridden
      ? 'HOMEPAGE_OVERRIDE'
      : cover
        ? 'CATEGORY_COVER'
        : fallback
          ? 'PRODUCT_FALLBACK'
          : 'DEFAULT_FALLBACK';
    const selected = overridden ?? cover ?? fallback;
    const selectedAltText =
      selected && 'altText' in selected ? selected.altText : null;
    return {
      description: category.description,
      name: category.name,
      slug: category.slug,
      image: {
        url: selected?.url ?? null,
        altText:
          override?.coverAltText ||
          selectedAltText ||
          category.cover?.altText ||
          `${category.name} rental equipment`,
        focalPoint: (override?.coverFocalPoint ??
          category.cover?.focalPoint ??
          'center') as 'center' | 'top' | 'bottom' | 'left' | 'right',
        source,
      },
    };
  }

  private publicContent(
    content: HomepageContent,
    media: ReadonlyMap<string, string>,
  ) {
    const url = (id: string | null) => (id ? (media.get(id) ?? null) : null);
    const { mediaId: pickupMediaId, ...pickupDelivery } =
      content.pickupDelivery;
    const { mediaId: finalMediaId, ...finalCta } = content.finalCta;
    return {
      ...content,
      seo: {
        title: content.seo.title,
        description: content.seo.description,
        socialImageUrl: url(content.seo.socialImageMediaId),
      },
      hero: {
        ...content.hero,
        slides: content.hero.slides.flatMap((slide) => {
          if (!slide.enabled) return [];
          const desktopUrl = url(slide.desktopMediaId);
          return desktopUrl
            ? [
                {
                  description: slide.description,
                  focalPoint: slide.focalPoint,
                  enabled: slide.enabled,
                  desktopUrl,
                  mobileUrl: url(slide.mobileMediaId),
                },
              ]
            : [];
        }),
      },
      solutions: {
        ...content.solutions,
        items: content.solutions.items.map(({ mediaId, ...item }) => ({
          ...item,
          imageUrl: url(mediaId),
        })),
      },
      pickupDelivery: {
        ...pickupDelivery,
        imageUrl: url(pickupMediaId),
      },
      finalCta: {
        ...finalCta,
        imageUrl: url(finalMediaId),
      },
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

  private async validateReferences(
    tx: Prisma.TransactionClient,
    categoryIds: string[],
    productIds: string[],
    placements: MediaPlacementInput[],
    categoryOverrides: Array<{
      categoryId: string;
      mediaRef: HomepageMediaReference | null;
    }>,
  ) {
    if (
      categoryOverrides.some(
        (override) => !categoryIds.includes(override.categoryId),
      )
    )
      throw new UnprocessableEntityException(
        'A category image override must belong to a featured category',
      );
    const references = [
      ...placements.flatMap((placement) =>
        placement.mediaId
          ? [placement.mediaId]
          : placement.productImageId
            ? [`product:${placement.productImageId}`]
            : [],
      ),
      ...categoryOverrides.flatMap((item) =>
        item.mediaRef ? [item.mediaRef] : [],
      ),
    ];
    const homepageMediaIds = [
      ...new Set(references.filter((ref) => !ref.startsWith('product:'))),
    ];
    const productImageIds = [
      ...new Set(
        references
          .filter((ref) => ref.startsWith('product:'))
          .map((ref) => ref.slice('product:'.length)),
      ),
    ];
    const [categories, products, media, productImages] = await Promise.all([
      tx.category.count({
        where: { id: { in: categoryIds }, isActive: true, deletedAt: null },
      }),
      tx.product.count({
        where: {
          id: { in: productIds },
          isActive: true,
          deletedAt: null,
          category: { isActive: true, deletedAt: null },
        },
      }),
      tx.homepageMedia.count({ where: { id: { in: homepageMediaIds } } }),
      tx.productImage.count({
        where: {
          id: { in: productImageIds },
          product: {
            isActive: true,
            deletedAt: null,
            category: { isActive: true, deletedAt: null },
          },
        },
      }),
    ]);
    if (
      categories !== categoryIds.length ||
      products !== productIds.length ||
      media !== homepageMediaIds.length ||
      productImages !== productImageIds.length
    )
      throw new UnprocessableEntityException(
        'Homepage selections contain unavailable records',
      );
  }
}
