import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default('');
const internalHref = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?!\/)[^\s]*$/, 'Use a safe site-relative path.');
const googleHref = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((value) => {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === 'google.com' || host.endsWith('.google.com') || host === 'goo.gl'
    );
  }, 'Use an HTTPS Google URL.')
  .refine((value) => value.startsWith('https://'), 'Use an HTTPS Google URL.');
const publicHomepageMediaUrl = z
  .string()
  .regex(/^\/media\/(?:homepage|products)\/[a-z0-9]+\/[a-f0-9]{64}\.webp$/);

const headingBlock = z
  .object({
    enabled: z.boolean().default(true),
    eyebrow: optionalText(80),
    heading: text(140),
    description: optionalText(500),
  })
  .strict();

const mediaId = z.string().cuid();
export const homepageMediaReferenceSchema = z.union([
  mediaId,
  z.string().regex(/^product:[a-z0-9]+$/),
]);
export const homepageFocalPointSchema = z.enum([
  'center',
  'top',
  'bottom',
  'left',
  'right',
]);
const iconKey = z.enum([
  'badge-check',
  'calendar-check',
  'clipboard-check',
  'clock',
  'headphones',
  'map-pin',
  'package-check',
  'shield-check',
  'sparkles',
  'truck',
  'users',
  'warehouse',
]);

export const homepageContentSchema = z
  .object({
    seo: z
      .object({
        title: text(70),
        description: text(180),
        socialImageMediaId: homepageMediaReferenceSchema
          .nullable()
          .default(null),
      })
      .strict(),
    hero: z
      .object({
        eyebrow: optionalText(80),
        heading: text(140),
        description: text(500),
        primaryLabel: text(50),
        primaryHref: internalHref,
        secondaryLabel: text(50),
        secondaryHref: internalHref,
        autoplayEnabled: z.boolean().default(true),
        intervalMs: z.number().int().min(5000).max(15000).default(7000),
        overlayIntensity: z
          .enum(['LIGHT', 'MEDIUM', 'STRONG'])
          .default('STRONG'),
        slides: z
          .array(
            z
              .object({
                desktopMediaId: homepageMediaReferenceSchema,
                mobileMediaId: homepageMediaReferenceSchema
                  .nullable()
                  .default(null),
                description: text(240),
                focalPoint: homepageFocalPointSchema.default('center'),
                enabled: z.boolean().default(true),
              })
              .strict(),
          )
          .max(3)
          .refine(
            (slides) => slides.filter((slide) => slide.enabled).length <= 3,
          ),
      })
      .strict(),
    trustItems: z
      .array(
        z
          .object({
            label: text(100),
            icon: iconKey,
            enabled: z.boolean().default(true),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    featuredCategories: headingBlock,
    benefits: headingBlock.extend({
      items: z
        .array(
          z
            .object({
              title: text(100),
              description: text(300),
              icon: iconKey,
              enabled: z.boolean().default(true),
            })
            .strict(),
        )
        .min(1)
        .max(4),
    }),
    featuredProducts: headingBlock,
    process: headingBlock.extend({
      steps: z
        .array(
          z
            .object({
              title: text(100),
              description: text(300),
            })
            .strict(),
        )
        .min(1)
        .max(4),
    }),
    solutions: headingBlock.extend({
      items: z
        .array(
          z
            .object({
              title: text(100),
              description: text(300),
              href: internalHref,
              mediaId: homepageMediaReferenceSchema.nullable().default(null),
              enabled: z.boolean().default(true),
            })
            .strict(),
        )
        .min(1)
        .max(4),
    }),
    reviews: headingBlock.extend({
      enabled: z.boolean().default(true),
      reviewsUrl: googleHref.nullable().default(null),
      writeReviewUrl: googleHref.nullable().default(null),
    }),
    pickupDelivery: headingBlock.extend({
      pickupTitle: text(100),
      pickupDescription: text(300),
      deliveryTitle: text(100),
      deliveryDescription: text(300),
      mediaId: homepageMediaReferenceSchema.nullable().default(null),
    }),
    serviceAreas: headingBlock.extend({
      areas: z
        .array(
          z
            .object({ label: text(100), enabled: z.boolean().default(true) })
            .strict(),
        )
        .min(1)
        .max(20),
    }),
    finalCta: z
      .object({
        heading: text(140),
        description: text(400),
        primaryLabel: text(50),
        primaryHref: internalHref,
        secondaryLabel: text(50),
        secondaryHref: internalHref,
        mediaId: homepageMediaReferenceSchema.nullable().default(null),
      })
      .strict(),
  })
  .strict();

export const saveHomepageDraftSchema = z
  .object({
    expectedLockVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
    content: homepageContentSchema,
    featuredCategoryIds: z
      .array(mediaId)
      .max(8)
      .refine((ids) => new Set(ids).size === ids.length),
    featuredCategoryOverrides: z
      .array(
        z
          .object({
            categoryId: mediaId,
            mediaRef: homepageMediaReferenceSchema.nullable(),
            altText: z.string().trim().max(300),
            focalPoint: homepageFocalPointSchema,
          })
          .strict(),
      )
      .max(8)
      .default([])
      .refine(
        (items) =>
          new Set(items.map((item) => item.categoryId)).size === items.length,
      ),
    featuredProductIds: z
      .array(mediaId)
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const homepageMutationSchema = z
  .object({
    expectedLockVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
  })
  .strict();

export const homepageMediaMetadataSchema = z
  .object({
    description: text(240),
  })
  .strict();

export const homepageMediaLibraryQuerySchema = z
  .object({
    search: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(24),
    source: z.enum(['ALL', 'HOMEPAGE', 'PRODUCT']).default('ALL'),
  })
  .strict();

export const categoryCoverSchema = z
  .object({
    mediaRef: homepageMediaReferenceSchema,
    altText: text(300),
    focalPoint: homepageFocalPointSchema.default('center'),
  })
  .strict();

export const publicHomepageContentSchema = homepageContentSchema
  .omit({
    seo: true,
    hero: true,
    solutions: true,
    pickupDelivery: true,
    finalCta: true,
  })
  .extend({
    seo: homepageContentSchema.shape.seo
      .omit({ socialImageMediaId: true })
      .extend({ socialImageUrl: publicHomepageMediaUrl.nullable() })
      .strict(),
    hero: homepageContentSchema.shape.hero
      .omit({ slides: true })
      .extend({
        slides: z.array(
          z
            .object({
              description: text(240),
              focalPoint: z.enum(['center', 'top', 'bottom', 'left', 'right']),
              enabled: z.boolean(),
              desktopUrl: publicHomepageMediaUrl,
              mobileUrl: publicHomepageMediaUrl.nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
    solutions: homepageContentSchema.shape.solutions
      .omit({ items: true })
      .extend({
        items: z.array(
          homepageContentSchema.shape.solutions.shape.items.element
            .omit({ mediaId: true })
            .extend({ imageUrl: publicHomepageMediaUrl.nullable() })
            .strict(),
        ),
      })
      .strict(),
    pickupDelivery: homepageContentSchema.shape.pickupDelivery
      .omit({ mediaId: true })
      .extend({ imageUrl: publicHomepageMediaUrl.nullable() })
      .strict(),
    finalCta: homepageContentSchema.shape.finalCta
      .omit({ mediaId: true })
      .extend({ imageUrl: publicHomepageMediaUrl.nullable() })
      .strict(),
  })
  .strict();

const publicHomepageCategoryBaseSchema = z
  .object({
    description: z.string().nullable(),
    name: z.string(),
    slug: z.string(),
  })
  .strict();

const publicHomepageCategorySchema = publicHomepageCategoryBaseSchema
  .extend({
    image: z
      .object({
        altText: z.string(),
        focalPoint: homepageFocalPointSchema,
        source: z.enum([
          'HOMEPAGE_OVERRIDE',
          'CATEGORY_COVER',
          'PRODUCT_FALLBACK',
          'DEFAULT_FALLBACK',
        ]),
        url: publicHomepageMediaUrl.nullable(),
      })
      .strict(),
  })
  .strict();

export const publicHomepageResponseSchema = z
  .object({
    content: publicHomepageContentSchema,
    categories: z.array(publicHomepageCategorySchema),
    products: z.array(
      z
        .object({
          category: publicHomepageCategoryBaseSchema,
          images: z.array(
            z
              .object({
                altText: z.string(),
                isPrimary: z.boolean(),
                url: z.string().regex(/^\/media\/products\//),
              })
              .strict(),
          ),
          isFeatured: z.boolean(),
          name: z.string(),
          rentalUnit: z.string(),
          shortDescription: z.string(),
          slug: z.string(),
        })
        .strict(),
    ),
    googleReviews: z
      .object({
        live: z.literal(false),
        reviewsUrl: z.string().url().startsWith('https://').nullable(),
        writeReviewUrl: z.string().url().startsWith('https://').nullable(),
      })
      .strict(),
  })
  .strict();

export const HOMEPAGE_MEDIA_LIMITS = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  compressionQuality: 82,
  maxDimension: 2400,
  maxProcessedBytes: 2 * 1024 * 1024,
  maxSourceBytes: 10 * 1024 * 1024,
} as const;

export type HomepageContent = z.infer<typeof homepageContentSchema>;
export type PublicHomepageContent = z.infer<typeof publicHomepageContentSchema>;
export type PublicHomepageResponse = z.infer<
  typeof publicHomepageResponseSchema
>;
export type SaveHomepageDraftInput = z.infer<typeof saveHomepageDraftSchema>;
export type HomepageMutationInput = z.infer<typeof homepageMutationSchema>;
export type HomepageMediaReference = z.infer<
  typeof homepageMediaReferenceSchema
>;
export type HomepageMediaLibraryQuery = z.infer<
  typeof homepageMediaLibraryQuerySchema
>;
export type CategoryCoverInput = z.infer<typeof categoryCoverSchema>;

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  seo: {
    title: 'Equipment rentals for events, productions, and projects',
    description:
      'Browse equipment and submit a custom rental request to Mensah Rentals for your next event, production, or project.',
    socialImageMediaId: null,
  },
  hero: {
    eyebrow: 'Equipment rental, thoughtfully handled',
    heading: 'The right equipment for the work ahead.',
    description:
      'Build a rental request for your event, production, or project. Our team reviews every request and prepares a tailored quote.',
    primaryLabel: 'Browse rental equipment',
    primaryHref: '/rentals',
    secondaryLabel: 'Track a request',
    secondaryHref: '/track-request',
    autoplayEnabled: true,
    intervalMs: 7000,
    overlayIntensity: 'STRONG',
    slides: [],
  },
  trustItems: [
    { label: 'Reliable equipment', icon: 'shield-check', enabled: true },
    { label: 'Pickup or delivery', icon: 'truck', enabled: true },
    { label: 'Flexible quantities', icon: 'package-check', enabled: true },
    {
      label: 'Staff-reviewed quotes',
      icon: 'clipboard-check',
      enabled: true,
    },
  ],
  featuredCategories: {
    enabled: true,
    eyebrow: 'Browse by category',
    heading: 'Start with what your project needs',
    description:
      'Explore practical equipment groups and build a request at your own pace.',
  },
  benefits: {
    enabled: true,
    eyebrow: 'Why Mensah Rentals',
    heading: 'A rental process built around real project needs',
    description:
      'Every request is reviewed by our team before pricing or confirmation.',
    items: [
      {
        title: 'Human review',
        description:
          'A staff member reviews the equipment and dates you request.',
        icon: 'clipboard-check',
        enabled: true,
      },
      {
        title: 'Flexible quantities',
        description:
          'Request the quantity you need without public stock limits.',
        icon: 'package-check',
        enabled: true,
      },
      {
        title: 'Custom quotation',
        description: 'Pricing is prepared for your specific request.',
        icon: 'badge-check',
        enabled: true,
      },
      {
        title: 'Coordinated handoff',
        description: 'Pickup or delivery details are confirmed with your team.',
        icon: 'truck',
        enabled: true,
      },
    ],
  },
  featuredProducts: {
    enabled: true,
    eyebrow: 'Featured equipment',
    heading: 'Popular starting points',
    description:
      'Add items to a rental cart now and complete the project details when you are ready.',
  },
  process: {
    enabled: true,
    eyebrow: 'How it works',
    heading: 'From equipment list to confirmed rental',
    description:
      'The platform keeps requests, approvals, quotes, and confirmed orders separate.',
    steps: [
      {
        title: 'Browse',
        description: 'Explore the catalogue and choose desired quantities.',
      },
      {
        title: 'Request',
        description:
          'Share your dates, contact details, and project information.',
      },
      {
        title: 'Review',
        description: 'Our team checks the request and prepares an outcome.',
      },
      {
        title: 'Confirm',
        description:
          'Review the tailored quote before any rental is confirmed.',
      },
    ],
  },
  solutions: {
    enabled: true,
    eyebrow: 'Built for varied work',
    heading: 'Equipment support across different settings',
    description:
      'Plan an equipment request for gatherings, productions, organizations, and field projects.',
    items: [
      {
        title: 'Events',
        description: 'Equipment for gatherings and live experiences.',
        href: '/rentals',
        mediaId: null,
        enabled: true,
      },
      {
        title: 'Film productions',
        description: 'Practical support for production environments.',
        href: '/rentals',
        mediaId: null,
        enabled: true,
      },
      {
        title: 'Corporate projects',
        description: 'Flexible equipment for teams and organized programs.',
        href: '/rentals',
        mediaId: null,
        enabled: true,
      },
      {
        title: 'Community work',
        description: 'Rental support for local initiatives and field activity.',
        href: '/rentals',
        mediaId: null,
        enabled: true,
      },
    ],
  },
  reviews: {
    enabled: true,
    eyebrow: 'Customer feedback',
    heading: 'See what customers share on Google',
    description: 'Open our Google profile to read current customer feedback.',
    reviewsUrl: null,
    writeReviewUrl: null,
  },
  pickupDelivery: {
    enabled: true,
    eyebrow: 'Flexible fulfilment',
    heading: 'Plan the handoff that works for your project',
    description: 'Final arrangements are confirmed by our team after review.',
    pickupTitle: 'Pickup',
    pickupDescription:
      'Coordinate an agreed collection time and handoff contact.',
    deliveryTitle: 'Delivery',
    deliveryDescription:
      'Share the destination so our team can review delivery requirements.',
    mediaId: null,
  },
  serviceAreas: {
    enabled: true,
    eyebrow: 'Service areas',
    heading: 'Tell us where the equipment is needed',
    description: 'Service coverage is confirmed as part of request review.',
    areas: [
      {
        label: 'Service location confirmed during request review',
        enabled: true,
      },
    ],
  },
  finalCta: {
    heading: 'Ready to build your equipment request?',
    description:
      'Browse the catalogue, choose desired quantities, and let our team handle the review.',
    primaryLabel: 'Browse rentals',
    primaryHref: '/rentals',
    secondaryLabel: 'View rental cart',
    secondaryHref: '/cart',
    mediaId: null,
  },
};
