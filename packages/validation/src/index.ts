import { z } from 'zod';

const environmentBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

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
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PUBLIC_CART_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('mensah_rental_cart'),
    PUBLIC_CART_COOKIE_SECURE: environmentBoolean.default('false'),
    PUBLIC_CART_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
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

    if (!environment.STAFF_SESSION_COOKIE_NAME.startsWith('__Host-')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production staff session cookies must use the __Host- prefix',
        path: ['STAFF_SESSION_COOKIE_NAME'],
      });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export const catalogueSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase words separated by hyphens.',
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
  name: z.string().trim().min(1).max(160),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
};

export const createCategorySchema = z
  .object({
    ...categoryMutableFields,
    slug: catalogueSlugSchema,
    isActive: z.boolean().default(true),
  })
  .strict();
export const updateCategorySchema = z.object(categoryMutableFields).strict();

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
  name: z.string().trim().min(1).max(160),
  rentalUnit: z.string().trim().min(1).max(50).default('each'),
  shortDescription: z.string().trim().min(1).max(300),
  specifications: z.array(productSpecificationInputSchema).max(50).default([]),
};

export const createProductSchema = z
  .object({
    ...productMutableFields,
    slug: catalogueSlugSchema,
    isActive: z.boolean().default(true),
  })
  .strict();
export const updateProductSchema = z.object(productMutableFields).strict();

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
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const inventoryTrackingModeSchema = z.enum(['BULK', 'SERIALIZED']);
export const inventoryStateSchema = z.enum([
  'RENTABLE',
  'RENTED',
  'MAINTENANCE',
  'DAMAGED',
  'LOST',
  'RETIRED',
]);
const inventoryOperationIdSchema = z.string().uuid();
const inventoryReasonSchema = z.string().trim().min(1).max(1000);
const inventoryQuantitySchema = z.number().int().min(1).max(1_000_000);

export const inventoryListQuerySchema = z
  .object({
    page: boundedPage,
    pageSize: boundedPageSize,
    search: z.string().trim().max(100).optional(),
    trackingMode: inventoryTrackingModeSchema.optional(),
    sortBy: z
      .enum(['productName', 'createdAt', 'updatedAt'])
      .default('productName'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const inventoryPageQuerySchema = z
  .object({ page: boundedPage, pageSize: boundedPageSize })
  .strict();

export const createInventorySchema = z
  .object({
    productId: cuidParamSchema,
    trackingMode: inventoryTrackingModeSchema,
    initialQuantity: inventoryQuantitySchema.optional(),
    initialState: inventoryStateSchema.default('RENTABLE'),
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
    fromState: inventoryStateSchema,
    toState: inventoryStateSchema,
    quantity: inventoryQuantitySchema,
    operationId: inventoryOperationIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict()
  .refine((value) => value.fromState !== value.toState, {
    message: 'Source and destination states must differ.',
    path: ['toState'],
  });

export const createInventoryItemSchema = z
  .object({
    assetNumber: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((value) => value.toUpperCase()),
    serialNumber: z.string().trim().min(1).max(160).nullable().optional(),
    initialState: inventoryStateSchema.default('RENTABLE'),
    operationId: inventoryOperationIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const transitionInventoryItemSchema = z
  .object({
    toState: inventoryStateSchema,
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
