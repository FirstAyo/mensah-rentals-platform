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
