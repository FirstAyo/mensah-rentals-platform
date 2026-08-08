import { UnprocessableEntityException } from '@nestjs/common';
import { z, type ZodType, type ZodTypeDef } from 'zod';

import { reportPresetSchema } from '../reporting/reporting.schemas';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    );
  }, 'Invalid calendar date');

export const auditSourceSchema = z.enum([
  'PLATFORM',
  'RENTAL_REQUEST',
  'QUOTE',
  'ORDER',
  'RESERVATION',
  'FULFILMENT',
  'INVENTORY',
  'RETURN',
  'MAINTENANCE',
  'HOMEPAGE',
]);

export const auditQuerySchema = z
  .object({
    action: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,100}$/)
      .optional(),
    actorUserId: z.string().cuid().optional(),
    domain: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,40}$/)
      .optional(),
    endDate: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    preset: reportPresetSchema.default('LAST_30_DAYS'),
    search: z.string().trim().max(120).optional(),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
    startDate: isoDate.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.preset === 'CUSTOM' && (!value.startDate || !value.endDate))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Custom audit searches require start and end dates.',
        path: ['startDate'],
      });
    if (value.startDate && value.endDate && value.startDate > value.endDate)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The start date must not be after the end date.',
        path: ['endDate'],
      });
  });

export const auditDetailParamSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9-]+$/),
    source: auditSourceSchema,
  })
  .strict();

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditDetailParam = z.infer<typeof auditDetailParamSchema>;

export class AuditValidationPipe<T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message: 'Invalid audit-history request',
        statusCode: 422,
      });
    return result.data;
  }
}
