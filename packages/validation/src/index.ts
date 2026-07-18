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
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
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
  z.coerce.number().int().min(1),
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

const productImageInputSchema = z
  .object({
    altText: z.string().trim().min(1).max(300),
    isPrimary: z.boolean().default(false),
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine(
        (value) => value.startsWith('/media/') || /^https:\/\//i.test(value),
        {
          message: 'Use an HTTPS URL or a managed /media/ path.',
        },
      ),
  })
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
  images: z
    .array(productImageInputSchema)
    .max(20)
    .default([])
    .superRefine((images, context) => {
      const primaryCount = images.filter(({ isPrimary }) => isPrimary).length;
      if (images.length > 0 && primaryCount !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select exactly one primary image.',
        });
      }
      if (images.length === 0 && primaryCount !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'An empty image list cannot have a primary image.',
        });
      }
    }),
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
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
