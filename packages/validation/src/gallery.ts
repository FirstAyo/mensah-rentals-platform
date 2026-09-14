import { z } from 'zod';

export const GALLERY_SLUG_MAX_LENGTH = 160;
export const GALLERY_PROJECT_MEDIA_LIMIT = 20;

/**
 * Produces the ASCII, SEO-safe slug format used by public Gallery routes.
 * Accented Latin input is folded to its base character; unsupported scripts
 * are treated as separators so they can never create malformed URLs.
 */
export function createGallerySlug(
  value: string,
  maxLength = GALLERY_SLUG_MAX_LENGTH,
) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[\u2018\u2019'\u201c\u201d"]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength);
  const lastDash = clipped.lastIndexOf('-');
  return (
    lastDash >= Math.floor(maxLength * 0.6)
      ? clipped.slice(0, lastDash)
      : clipped
  ).replace(/-+$/g, '');
}

export function gallerySlugWithSuffix(base: string, suffix: number) {
  const ending = `-${suffix}`;
  const available = GALLERY_SLUG_MAX_LENGTH - ending.length;
  return `${createGallerySlug(base, available)}${ending}`;
}

export const galleryServiceTypes = [
  'FILM_PRODUCTION',
  'EVENTS_FESTIVALS',
  'CORPORATE_FUNCTIONS',
  'PRIVATE_FUNCTIONS',
] as const;

export const galleryServiceSlugs = [
  'film-production',
  'events-festivals',
  'corporate-functions',
  'private-functions',
] as const;

export const galleryServiceTypeSchema = z.enum(galleryServiceTypes);
export const galleryServiceSlugSchema = z.enum(galleryServiceSlugs);
export const gallerySlugSchema = z
  .string()
  .trim()
  .min(2, 'Enter a Gallery URL with at least 2 characters.')
  .max(
    GALLERY_SLUG_MAX_LENGTH,
    `Gallery URLs can contain up to ${GALLERY_SLUG_MAX_LENGTH} characters.`,
  )
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers, and single hyphens only.',
  );

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const optionalText = (max: number) =>
  z
    .preprocess(
      (value) => (value == null ? '' : value),
      z.string().trim().max(max),
    )
    .transform((value) => value || null);

export const galleryMediaInputSchema = z
  .object({
    mediaId: z.string().cuid(),
    altText: z
      .string()
      .trim()
      .min(1, 'Add alt text describing this image.')
      .max(300, 'Alt text can contain up to 300 characters.'),
    focalPoint: z
      .enum(['center', 'top', 'bottom', 'left', 'right'])
      .default('center'),
  })
  .strict();

export const galleryProjectContentSchema = z
  .object({
    slug: gallerySlugSchema,
    title: z
      .string()
      .trim()
      .min(1, 'Enter a project title.')
      .max(180, 'Project titles can contain up to 180 characters.'),
    serviceType: galleryServiceTypeSchema,
    shortDescription: z
      .string()
      .trim()
      .min(1, 'Enter a short project description.')
      .max(400, 'Short descriptions can contain up to 400 characters.'),
    description: optionalText(5000),
    eventDate: optionalDate,
    location: optionalText(240),
    featured: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10000).default(0),
    seoTitle: optionalText(70),
    seoDescription: optionalText(180),
  })
  .strict();

export const createGalleryProjectSchema = z
  .object({
    operationId: z.string().uuid(),
    slugMode: z.enum(['AUTO', 'MANUAL']).optional(),
    content: galleryProjectContentSchema,
    media: z
      .array(galleryMediaInputSchema)
      .min(1, 'Add at least one Gallery image.')
      .max(
        GALLERY_PROJECT_MEDIA_LIMIT,
        `You can add up to ${GALLERY_PROJECT_MEDIA_LIMIT} images to a Gallery project.`,
      )
      .refine(
        (items) =>
          new Set(items.map((item) => item.mediaId)).size === items.length,
        'Gallery media must be unique.',
      ),
  })
  .strict();

export const saveGalleryDraftSchema = createGalleryProjectSchema.extend({
  expectedLockVersion: z.number().int().min(0),
});

export const galleryMutationSchema = z
  .object({
    expectedLockVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
  })
  .strict();

export const galleryAdminListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).default(''),
    serviceType: galleryServiceTypeSchema.optional(),
    state: z.enum(['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED']).default('ALL'),
  })
  .strict();

export const publicGalleryQuerySchema = z
  .object({ type: galleryServiceSlugSchema.optional() })
  .strict();

export type GalleryServiceType = z.infer<typeof galleryServiceTypeSchema>;
export type GalleryServiceSlug = z.infer<typeof galleryServiceSlugSchema>;
export type GalleryProjectContentInput = z.infer<
  typeof galleryProjectContentSchema
>;
export type CreateGalleryProjectInput = z.infer<
  typeof createGalleryProjectSchema
>;
export type SaveGalleryDraftInput = z.infer<typeof saveGalleryDraftSchema>;
export type GalleryMutationInput = z.infer<typeof galleryMutationSchema>;
export type GalleryAdminListQuery = z.infer<typeof galleryAdminListQuerySchema>;
export type PublicGalleryQuery = z.infer<typeof publicGalleryQuerySchema>;

export const GALLERY_SERVICE_PRESENTATION: Record<
  GalleryServiceType,
  { label: string; slug: GalleryServiceSlug }
> = {
  FILM_PRODUCTION: { label: 'Film Production', slug: 'film-production' },
  EVENTS_FESTIVALS: {
    label: 'Events & Festivals',
    slug: 'events-festivals',
  },
  CORPORATE_FUNCTIONS: {
    label: 'Corporate Functions',
    slug: 'corporate-functions',
  },
  PRIVATE_FUNCTIONS: {
    label: 'Private Functions',
    slug: 'private-functions',
  },
};

export function galleryServiceTypeFromSlug(slug: GalleryServiceSlug) {
  return galleryServiceTypes.find(
    (type) => GALLERY_SERVICE_PRESENTATION[type].slug === slug,
  )!;
}
