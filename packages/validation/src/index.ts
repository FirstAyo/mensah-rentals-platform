import { z } from 'zod';

export * from './feature-settings';

export * from './quote';
export * from './order';
export * from './fulfilment';
export * from './returns';
export * from './homepage';
export * from './google-reviews';
export * from './maintenance';

const environmentBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalEnvironmentString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalEnvironmentUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);
const ianaTimeZoneSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'A valid IANA time zone is required.' },
  );

export const staffLoginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const cuidParamSchema = z.string().cuid();

export const replaceUserRolesSchema = z
  .object({
    roleIds: z
      .array(cuidParamSchema)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Role IDs must be unique.',
      }),
  })
  .strict();

export const replaceRolePermissionsSchema = z
  .object({
    permissionIds: z
      .array(cuidParamSchema)
      .max(250)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Permission IDs must be unique.',
      }),
  })
  .strict();

export type ReplaceUserRolesInput = z.infer<typeof replaceUserRolesSchema>;
export type ReplaceRolePermissionsInput = z.infer<
  typeof replaceRolePermissionsSchema
>;

export const staffBootstrapEnvironmentSchema = z.object({
  NODE_ENV: z.literal('development'),
  STAFF_BOOTSTRAP_EMAIL: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  STAFF_BOOTSTRAP_FIRST_NAME: z.string().trim().min(1).max(100),
  STAFF_BOOTSTRAP_LAST_NAME: z.string().trim().min(1).max(100),
  STAFF_BOOTSTRAP_PASSWORD: z.string().min(12).max(128),
});

export type StaffBootstrapEnvironment = z.infer<
  typeof staffBootstrapEnvironmentSchema
>;

export const apiEnvironmentSchema = z
  .object({
    PLATFORM_ENVIRONMENT: z
      .enum(['LOCAL', 'STAGING', 'PRODUCTION'])
      .default('PRODUCTION'),
    ADMIN_ORIGIN: z.string().url().default('http://localhost:3001'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    AUTH_COOKIE_SECURE: environmentBoolean.default('false'),
    AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(5),
    AUTH_LOGIN_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    MEDIA_STORAGE_ROOT: z.string().trim().min(1).default('storage/media'),
    REPORTING_TIME_ZONE: ianaTimeZoneSchema.default('Africa/Accra'),
    REPORT_EXPORT_MAX_ROWS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(10_000),
    REPORT_EXPORT_MAX_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3_660)
      .default(366),
    BACKUP_STATUS_FILE: z
      .string()
      .trim()
      .min(1)
      .default('.local-backups/backup-status.json'),
    APP_VERSION: optionalEnvironmentString,
    APP_COMMIT_SHA: optionalEnvironmentString,
    TRUST_PROXY_REQUEST_ID: environmentBoolean.default('false'),
    GOOGLE_REVIEWS_LIVE_ENABLED: environmentBoolean.default('false'),
    GOOGLE_PLACES_API_KEY: optionalEnvironmentString,
    GOOGLE_BUSINESS_PLACE_ID: optionalEnvironmentString,
    GOOGLE_PLACES_LANGUAGE_CODE: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/)
      .default('en-CA'),
    GOOGLE_PLACES_REGION_CODE: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/)
      .default('CA'),
    GOOGLE_PLACES_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(10_000)
      .default(4000),
    PUBLIC_GOOGLE_REVIEWS_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(120),
    PUBLIC_GOOGLE_REVIEWS_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    GOOGLE_REVIEWS_URL: optionalEnvironmentUrl,
    GOOGLE_WRITE_REVIEW_URL: optionalEnvironmentUrl,
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PUBLIC_CART_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('mensah_rental_cart'),
    PUBLIC_CART_COOKIE_SECURE: environmentBoolean.default('false'),
    PUBLIC_CART_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    PUBLIC_CART_READ_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(300),
    PUBLIC_CART_READ_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    PUBLIC_CART_MUTATION_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(120),
    PUBLIC_CART_MUTATION_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    PUBLIC_CART_GLOBAL_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(100)
      .max(100000)
      .default(10000),
    PUBLIC_CART_GLOBAL_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    PUBLIC_REQUEST_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('mensah_rental_request'),
    PUBLIC_REQUEST_COOKIE_SECURE: environmentBoolean.default('false'),
    PUBLIC_REQUEST_TRACKING_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(180),
    PUBLIC_REQUEST_TRACKING_SECRET: z
      .string()
      .min(32)
      .default('development-only-change-this-tracking-secret'),
    PUBLIC_REQUEST_SUBMIT_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(5),
    PUBLIC_REQUEST_SUBMIT_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(86400)
      .default(3600),
    PUBLIC_REQUEST_TRACK_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(60),
    PUBLIC_REQUEST_TRACK_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    PUBLIC_REQUEST_GLOBAL_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(100)
      .max(100000)
      .default(10000),
    PUBLIC_REQUEST_GLOBAL_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    PUBLIC_QUOTE_ACCESS_SECRET: z
      .string()
      .min(32)
      .default('development-only-change-this-quote-secret'),
    PUBLIC_QUOTE_ACCESS_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(30),
    PUBLIC_ORDER_ACCESS_SECRET: z
      .string()
      .min(32)
      .default('development-only-change-this-order-secret'),
    PUBLIC_ORDER_ACCESS_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(90),
    PUBLIC_ORDER_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('mensah_order_access'),
    PUBLIC_ORDER_COOKIE_SECURE: environmentBoolean.default('false'),
    STAFF_SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('mensah_staff_session'),
    STAFF_SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(12),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== 'production') {
      return;
    }

    if (!environment.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AUTH_COOKIE_SECURE must be true in production',
        path: ['AUTH_COOKIE_SECURE'],
      });
    }

    if (!environment.PUBLIC_CART_COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PUBLIC_CART_COOKIE_SECURE must be true in production',
        path: ['PUBLIC_CART_COOKIE_SECURE'],
      });
    }

    if (!environment.PUBLIC_CART_COOKIE_NAME.startsWith('__Host-')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production cart cookies must use the __Host- prefix',
        path: ['PUBLIC_CART_COOKIE_NAME'],
      });
    }

    if (!environment.PUBLIC_REQUEST_COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PUBLIC_REQUEST_COOKIE_SECURE must be true in production',
        path: ['PUBLIC_REQUEST_COOKIE_SECURE'],
      });
    }

    if (!environment.PUBLIC_REQUEST_COOKIE_NAME.startsWith('__Host-')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production request cookies must use the __Host- prefix',
        path: ['PUBLIC_REQUEST_COOKIE_NAME'],
      });
    }

    if (
      environment.PUBLIC_REQUEST_TRACKING_SECRET.startsWith('development-only')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production request tracking requires a unique secret',
        path: ['PUBLIC_REQUEST_TRACKING_SECRET'],
      });
    }

    if (environment.PUBLIC_QUOTE_ACCESS_SECRET.startsWith('development-only')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production quote access requires a unique secret',
        path: ['PUBLIC_QUOTE_ACCESS_SECRET'],
      });
    }

    if (environment.PUBLIC_ORDER_ACCESS_SECRET.startsWith('development-only')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production order access requires a unique secret',
        path: ['PUBLIC_ORDER_ACCESS_SECRET'],
      });
    }

    if (!environment.PUBLIC_ORDER_COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PUBLIC_ORDER_COOKIE_SECURE must be true in production',
        path: ['PUBLIC_ORDER_COOKIE_SECURE'],
      });
    }

    if (!environment.PUBLIC_ORDER_COOKIE_NAME.startsWith('__Host-')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production order cookies must use the __Host- prefix',
        path: ['PUBLIC_ORDER_COOKIE_NAME'],
      });
    }

    if (
      environment.PUBLIC_ORDER_ACCESS_SECRET ===
      environment.PUBLIC_QUOTE_ACCESS_SECRET
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Order and quote access secrets must be different',
        path: ['PUBLIC_ORDER_ACCESS_SECRET'],
      });
    }

    if (!environment.STAFF_SESSION_COOKIE_NAME.startsWith('__Host-')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production staff session cookies must use the __Host- prefix',
        path: ['STAFF_SESSION_COOKIE_NAME'],
      });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

const normalizedSlugSchema = (message: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(
      z
        .string()
        .min(1, message)
        .max(120, message)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, message),
    );

export const catalogueSlugSchema = normalizedSlugSchema(
  'Please enter a valid category slug.',
);
export const productSlugSchema = normalizedSlugSchema(
  'Please enter a valid product slug.',
);

const boundedPage = z.preprocess(
  (value) => (value === undefined ? 1 : value),
  z.coerce.number().int().min(1).max(10_000),
);
const boundedPageSize = z.preprocess(
  (value) => (value === undefined ? 20 : value),
  z.coerce.number().int().min(1).max(100),
);
const optionalBooleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const categoryListQuerySchema = z
  .object({
    isActive: optionalBooleanQuery,
    page: boundedPage,
    pageSize: boundedPageSize,
    search: z.string().trim().max(100).optional(),
    sortBy: z
      .enum(['name', 'sortOrder', 'createdAt', 'updatedAt'])
      .default('sortOrder'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const productListQuerySchema = z
  .object({
    categoryId: cuidParamSchema.optional(),
    categorySlug: catalogueSlugSchema.optional(),
    isActive: optionalBooleanQuery,
    isFeatured: optionalBooleanQuery,
    page: boundedPage,
    pageSize: boundedPageSize,
    search: z.string().trim().max(100).optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const publicCategoryListQuerySchema = z
  .object({
    page: boundedPage,
    pageSize: boundedPageSize,
    search: z.string().trim().max(100).optional(),
  })
  .strict();

export const publicProductListQuerySchema = z
  .object({
    categorySlug: catalogueSlugSchema.optional(),
    isFeatured: z
      .enum(['true'])
      .transform(() => true as const)
      .optional(),
    page: boundedPage,
    pageSize: boundedPageSize,
    search: z.string().trim().max(100).optional(),
    sort: z
      .enum(['featured', 'name-asc', 'name-desc', 'newest'])
      .default('featured'),
  })
  .strict();

const categoryMutableFields = {
  description: z.string().trim().max(4000).nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Please enter a category name.')
    .max(160, 'Please enter a category name.'),
  slug: catalogueSlugSchema,
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
};

export const createCategorySchema = z
  .object({
    ...categoryMutableFields,
    isActive: z.boolean().default(true),
  })
  .strict();
export const updateCategorySchema = z.object(categoryMutableFields).strict();

export const deleteCategorySchema = z
  .object({ confirmDeleteProducts: z.boolean().default(false) })
  .strict();

export const PRODUCT_IMAGE_LIMITS = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  compressionQuality: 82,
  maxDimension: 2400,
  maxImages: 4,
  maxProcessedBytes: 2 * 1024 * 1024,
  maxSourceBytes: 10 * 1024 * 1024,
} as const;

export const updateProductImageSchema = z
  .object({
    altText: z.string().trim().min(1).max(300),
    isPrimary: z.boolean(),
  })
  .strict();

export type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;

export const productImageUploadMetadataSchema = z
  .object({ altText: z.string().trim().min(1).max(300) })
  .strict();

const productSpecificationInputSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(500),
  })
  .strict();

const productMutableFields = {
  categoryId: cuidParamSchema,
  description: z.string().trim().max(20_000).nullable().optional(),
  isFeatured: z.boolean().default(false),
  name: z
    .string()
    .trim()
    .min(1, 'Please enter a product name.')
    .max(160, 'Please enter a product name.'),
  rentalUnit: z.string().trim().min(1).max(50).default('each'),
  shortDescription: z.string().trim().min(1).max(300),
  slug: productSlugSchema,
  specifications: z.array(productSpecificationInputSchema).max(50).default([]),
};

export const createProductSchema = z
  .object({
    ...productMutableFields,
    isActive: z.boolean().default(true),
  })
  .strict();
export const updateProductSchema = z.object(productMutableFields).strict();
export const deleteProductSchema = z
  .object({ confirmPermanentDelete: z.boolean().default(false) })
  .strict();

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type PublicCategoryListQuery = z.infer<
  typeof publicCategoryListQuerySchema
>;
export type PublicProductListQuery = z.infer<
  typeof publicProductListQuerySchema
>;

export const setCartItemSchema = z
  .object({
    desiredQuantity: z.number().int().min(1).max(1000),
  })
  .strict();

export type SetCartItemInput = z.infer<typeof setCartItemSchema>;

const rentalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
    );
  }, 'Enter a valid calendar date.');

const nullableTrimmedText = (maximum: number) =>
  z
    .union([z.string().trim().max(maximum), z.null()])
    .optional()
    .transform((value) => (value ? value : null));

export const rentalRequestReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MR-\d{4}-[A-Z0-9]{10}$/);

const rentalRequestDetailsSchema = z
  .object({
    submissionId: z.string().uuid(),
    contactFirstName: z.string().trim().min(1).max(100),
    contactLastName: z.string().trim().min(1).max(100),
    contactEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    contactPhone: z
      .string()
      .trim()
      .min(7)
      .max(30)
      .regex(/^[0-9+() .'-]+$/, 'Enter a valid phone number.'),
    companyName: nullableTrimmedText(160),
    projectName: z.string().trim().min(1).max(160),
    projectType: z.string().trim().min(1).max(100),
    projectLocation: z.string().trim().min(1).max(500),
    fulfillmentMethod: z.enum(['PICKUP', 'DELIVERY', 'DELIVERY_AND_SETUP']),
    deliveryAddress: nullableTrimmedText(500),
    rentalStartDate: rentalDateSchema,
    rentalEndDate: rentalDateSchema,
    requestedTimeZone: z.string().trim().min(1).max(100),
    customerNotes: nullableTrimmedText(3000),
  })
  .strict();

function validateRentalRequestDates(
  value: Pick<
    z.infer<typeof rentalRequestDetailsSchema>,
    | 'rentalStartDate'
    | 'rentalEndDate'
    | 'fulfillmentMethod'
    | 'deliveryAddress'
    | 'requestedTimeZone'
  >,
  context: z.RefinementCtx,
) {
  const start = new Date(`${value.rentalStartDate}T00:00:00.000Z`);
  const end = new Date(`${value.rentalEndDate}T00:00:00.000Z`);
  const durationDays = (end.valueOf() - start.valueOf()) / 86_400_000;
  if (durationDays < 0)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rentalEndDate'],
      message: 'End date must be on or after the start date.',
    });
  if (durationDays > 366)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rentalEndDate'],
      message: 'Rental requests cannot span more than 366 days.',
    });
  if (value.fulfillmentMethod !== 'PICKUP' && !value.deliveryAddress)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deliveryAddress'],
      message: 'A delivery address is required for delivery.',
    });
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.requestedTimeZone });
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requestedTimeZone'],
      message: 'Enter a valid time zone.',
    });
  }
}

export const submitRentalRequestSchema = rentalRequestDetailsSchema.superRefine(
  validateRentalRequestDates,
);

export type SubmitRentalRequestInput = z.infer<
  typeof submitRentalRequestSchema
>;
export type SubmitRentalRequestFormInput = z.input<
  typeof submitRentalRequestSchema
>;

export const rentalRequestAdminStatusSchema = z.enum([
  'SUBMITTED',
  'RE_REVIEW_REQUIRED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
]);

export const rentalRequestAdminListQuerySchema = z
  .object({
    page: boundedPage,
    pageSize: boundedPageSize,
    search: z.string().trim().max(160).optional(),
    status: rentalRequestAdminStatusSchema.optional(),
    assignment: z
      .enum(['ALL', 'ASSIGNED', 'UNASSIGNED', 'MINE'])
      .default('ALL'),
    assignedToUserId: cuidParamSchema.optional(),
    fulfillmentMethod: z
      .enum(['PICKUP', 'DELIVERY', 'DELIVERY_AND_SETUP'])
      .optional(),
    rentalStartFrom: rentalDateSchema.optional(),
    rentalStartTo: rentalDateSchema.optional(),
    sortBy: z
      .enum(['submittedAt', 'rentalStartDate', 'updatedAt'])
      .default('submittedAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.rentalStartFrom &&
      value.rentalStartTo &&
      value.rentalStartFrom > value.rentalStartTo
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rentalStartTo'],
        message: 'The end of the rental-start filter must not be earlier.',
      });
  });

const expectedReviewVersionSchema = z.number().int().min(0);

const rentalRequestReplacementItemSchema = z
  .object({
    productId: cuidParamSchema,
    requestedQuantity: z.number().int().min(1).max(1000),
  })
  .strict();

const completeReplacementItemsSchema = z
  .array(rentalRequestReplacementItemSchema)
  .min(1, 'At least one equipment item is required.')
  .max(100)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.productId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'productId'],
          message: 'Each product may appear only once.',
        });
      seen.add(item.productId);
    });
  });

const requestRevisionFieldsSchema = rentalRequestDetailsSchema.omit({
  submissionId: true,
});

export const submitRentalRequestAmendmentSchema = requestRevisionFieldsSchema
  .extend({
    amendmentReason: z
      .string()
      .trim()
      .min(1, 'Please enter a reason for this amendment.')
      .max(2000),
    expectedRevisionNumber: z.number().int().min(1),
    items: completeReplacementItemsSchema,
    operationId: z.string().uuid(),
  })
  .strict()
  .superRefine(validateRentalRequestDates);

export const submitRentalChangeRequestSchema = requestRevisionFieldsSchema
  .extend({
    expectedRevisionNumber: z.number().int().min(1),
    items: completeReplacementItemsSchema,
    operationId: z.string().uuid(),
    reason: z
      .string()
      .trim()
      .min(1, 'Please enter a reason for this change request.')
      .max(2000),
  })
  .strict()
  .superRefine(validateRentalRequestDates);

export type SubmitRentalRequestAmendmentInput = z.infer<
  typeof submitRentalRequestAmendmentSchema
>;
export type SubmitRentalChangeRequestInput = z.infer<
  typeof submitRentalChangeRequestSchema
>;

export const updateRentalRequestAssignmentSchema = z
  .object({
    assigneeUserId: cuidParamSchema,
    expectedVersion: expectedReviewVersionSchema,
  })
  .strict();

export const unassignRentalRequestSchema = z
  .object({ expectedVersion: expectedReviewVersionSchema })
  .strict();

export const createRentalRequestInternalNoteSchema = z
  .object({
    operationId: z.string().uuid(),
    body: z.string().trim().min(1).max(3000),
  })
  .strict();

export const updateRentalRequestReviewStateSchema = z
  .object({
    status: z.literal('UNDER_REVIEW'),
    expectedVersion: expectedReviewVersionSchema,
  })
  .strict();

const rentalRequestDecisionOperationSchema = z.object({
  operationId: z.string().uuid(),
  expectedReviewVersion: expectedReviewVersionSchema,
  internalReason: z
    .string()
    .trim()
    .min(1, { message: 'Enter an internal reason.' })
    .max(3000),
});

const confidentialDecisionLanguage =
  /\b(?:inventory|stock|warehouse\s+count|on[\s-]+hand|availability|available|remain(?:s|ing)?|reserved|damaged|maintenance|lost|serial(?:\s+number)?|asset(?:\s+number)?|owned|in[\s-]+use)\b/i;
const thirdPartyDecisionLanguage =
  /\b(?:another|other)\s+(?:customer|client|booking|request)\b/i;
const htmlLikeMarkup = /<[^>]*>/u;

export function normalizeCustomerDecisionExplanation(value: string) {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function isCustomerDecisionExplanationSafe(value: string) {
  const normalized = normalizeCustomerDecisionExplanation(value);
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.codePointAt(0)!;
    return (
      code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)
    );
  });
  return (
    normalized.length >= 1 &&
    normalized.length <= 2000 &&
    !hasControlCharacter &&
    !htmlLikeMarkup.test(normalized) &&
    !confidentialDecisionLanguage.test(normalized) &&
    !thirdPartyDecisionLanguage.test(normalized)
  );
}

export const customerDecisionExplanationSchema = z
  .string()
  .min(1, { message: 'Enter a customer-safe explanation.' })
  .max(2000)
  .transform(normalizeCustomerDecisionExplanation)
  .refine(isCustomerDecisionExplanationSafe, {
    message:
      'Use customer-safe wording without internal inventory, asset-condition, or other-customer details.',
  });

export const reviewRentalChangeRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
    status: z.enum(['UNDER_REVIEW', 'APPROVED_FOR_REQUOTE', 'REJECTED']),
    internalNote: nullableTrimmedText(3000),
    customerExplanation: customerDecisionExplanationSchema
      .nullable()
      .optional(),
  })
  .strict();

export type ReviewRentalChangeRequestInput = z.infer<
  typeof reviewRentalChangeRequestSchema
>;

export const approveRentalRequestDecisionSchema =
  rentalRequestDecisionOperationSchema
    .extend({
      customerExplanation: customerDecisionExplanationSchema
        .nullable()
        .optional(),
    })
    .strict();

export const partiallyApproveRentalRequestDecisionSchema =
  rentalRequestDecisionOperationSchema
    .extend({
      customerExplanation: customerDecisionExplanationSchema,
      items: z
        .array(
          z
            .object({
              rentalRequestItemId: cuidParamSchema,
              approvedQuantity: z.number().int().min(0).max(1000),
            })
            .strict(),
        )
        .min(1)
        .max(100)
        .superRefine((items, context) => {
          const seen = new Set<string>();
          items.forEach((item, index) => {
            if (seen.has(item.rentalRequestItemId))
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: [index, 'rentalRequestItemId'],
                message: 'Each requested item may appear only once.',
              });
            seen.add(item.rentalRequestItemId);
          });
        }),
    })
    .strict();

export const rejectRentalRequestDecisionSchema =
  rentalRequestDecisionOperationSchema
    .extend({ customerExplanation: customerDecisionExplanationSchema })
    .strict();

export type AdminRentalRequestListQuery = z.infer<
  typeof rentalRequestAdminListQuerySchema
>;
export type UpdateRentalRequestAssignmentInput = z.infer<
  typeof updateRentalRequestAssignmentSchema
>;
export type UnassignRentalRequestInput = z.infer<
  typeof unassignRentalRequestSchema
>;
export type CreateRentalRequestInternalNoteInput = z.infer<
  typeof createRentalRequestInternalNoteSchema
>;
export type UpdateRentalRequestReviewStateInput = z.infer<
  typeof updateRentalRequestReviewStateSchema
>;
export type ApproveRentalRequestDecisionInput = z.infer<
  typeof approveRentalRequestDecisionSchema
>;
export type PartiallyApproveRentalRequestDecisionInput = z.infer<
  typeof partiallyApproveRentalRequestDecisionSchema
>;
export type RejectRentalRequestDecisionInput = z.infer<
  typeof rejectRentalRequestDecisionSchema
>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type DeleteProductInput = z.infer<typeof deleteProductSchema>;

export const inventoryTrackingModeSchema = z.enum(['BULK', 'SERIALIZED']);
export const inventoryStateSchema = z.enum([
  'RENTABLE',
  'RENTED',
  'MAINTENANCE',
  'DAMAGED',
  'MISSING',
  'LOST',
  'RETIRED',
]);
const inventoryOperationIdSchema = z.string().uuid();
const inventoryReasonSchema = z.string().trim().min(1).max(1000);
const inventoryQuantitySchema = z.number().int().min(1).max(1_000_000);
const inventoryReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .nullable()
  .optional();

export const inventoryListQuerySchema = z
  .object({
    page: boundedPage,
    pageSize: boundedPageSize,
    search: z.string().trim().max(100).optional(),
    trackingMode: inventoryTrackingModeSchema.optional(),
    lifecycle: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
    sortBy: z
      .enum(['productName', 'createdAt', 'updatedAt'])
      .default('productName'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const inventoryPageQuerySchema = z
  .object({ page: boundedPage, pageSize: boundedPageSize })
  .strict();

const inventoryInitialStateSchema = z.enum([
  'RENTABLE',
  'MAINTENANCE',
  'DAMAGED',
]);

export const createInventorySchema = z
  .object({
    productId: cuidParamSchema,
    trackingMode: inventoryTrackingModeSchema,
    initialQuantity: inventoryQuantitySchema.optional(),
    initialState: inventoryInitialStateSchema.default('RENTABLE'),
    operationId: inventoryOperationIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.trackingMode === 'BULK' && value.initialQuantity === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initialQuantity'],
        message: 'Bulk inventory requires an initial quantity.',
      });
    if (
      value.trackingMode === 'SERIALIZED' &&
      value.initialQuantity !== undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initialQuantity'],
        message: 'Serialized inventory is built from individual assets.',
      });
  });

export const bulkInventoryMovementSchema = z
  .object({
    fromState: z.literal('RENTABLE'),
    toState: z.literal('DAMAGED'),
    quantity: inventoryQuantitySchema,
    operationId: inventoryOperationIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const createInventoryItemSchema = z
  .object({
    assetNumber: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((value) => value.toUpperCase()),
    serialNumber: z.string().trim().min(1).max(160).nullable().optional(),
    initialState: inventoryInitialStateSchema.default('RENTABLE'),
    operationId: inventoryOperationIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const transitionInventoryItemSchema = z
  .object({
    toState: z.literal('DAMAGED'),
    operationId: inventoryOperationIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const updateInventoryMetadataSchema = z
  .object({
    operationId: inventoryOperationIdSchema,
    internalNotes: z.string().trim().min(1).max(3000).nullable(),
  })
  .strict();

export const addInventoryStockSchema = z
  .object({
    operationId: inventoryOperationIdSchema,
    quantity: inventoryQuantitySchema,
    reason: inventoryReasonSchema,
    reasonType: z.enum(['PURCHASE', 'ACQUISITION', 'OTHER']),
    reference: inventoryReferenceSchema,
  })
  .strict();

export const reduceInventoryStockSchema = z
  .object({
    operationId: inventoryOperationIdSchema,
    quantity: inventoryQuantitySchema,
    reason: inventoryReasonSchema,
    reasonType: z.enum([
      'SOLD',
      'RETIRED',
      'DISPOSED',
      'INVENTORY_CORRECTION',
      'OTHER',
    ]),
    reference: inventoryReferenceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.reasonType === 'INVENTORY_CORRECTION' &&
      value.reason.trim().length < 20
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message:
          'Inventory corrections require a detailed reason of at least 20 characters.',
      });
  });

export const inventoryLifecycleActionSchema = z
  .object({
    operationId: inventoryOperationIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
export type InventoryPageQuery = z.infer<typeof inventoryPageQuerySchema>;
export type CreateInventoryInput = z.infer<typeof createInventorySchema>;
export type BulkInventoryMovementInput = z.infer<
  typeof bulkInventoryMovementSchema
>;
export type CreateInventoryItemInput = z.infer<
  typeof createInventoryItemSchema
>;
export type TransitionInventoryItemInput = z.infer<
  typeof transitionInventoryItemSchema
>;
export type UpdateInventoryMetadataInput = z.infer<
  typeof updateInventoryMetadataSchema
>;
export type AddInventoryStockInput = z.infer<typeof addInventoryStockSchema>;
export type ReduceInventoryStockInput = z.infer<
  typeof reduceInventoryStockSchema
>;
export type InventoryLifecycleActionInput = z.infer<
  typeof inventoryLifecycleActionSchema
>;
