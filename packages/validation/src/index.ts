import { z } from 'zod';

export const apiEnvironmentSchema = z.object({
  ADMIN_ORIGIN: z.string().url().default('http://localhost:3001'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
