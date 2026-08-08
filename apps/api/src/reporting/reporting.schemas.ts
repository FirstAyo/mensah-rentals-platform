import { UnprocessableEntityException } from '@nestjs/common';
import { z, type ZodType, type ZodTypeDef } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    );
  }, 'Invalid calendar date');

export const reportPresetSchema = z.enum([
  'TODAY',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  'THIS_MONTH',
  'PREVIOUS_MONTH',
  'THIS_YEAR',
  'CUSTOM',
]);

const pagination = {
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

const range = {
  endDate: isoDate.optional(),
  preset: reportPresetSchema.default('LAST_30_DAYS'),
  startDate: isoDate.optional(),
};

function validateCustomRange(
  value: { endDate?: string; preset: string; startDate?: string },
  context: z.RefinementCtx,
) {
  if (value.preset === 'CUSTOM' && (!value.startDate || !value.endDate)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Custom reports require start and end dates.',
      path: ['startDate'],
    });
  }
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'The start date must not be after the end date.',
      path: ['endDate'],
    });
  }
}

export const reportOverviewQuerySchema = z
  .object(range)
  .strict()
  .superRefine(validateCustomRange);

const reportListBase = {
  ...range,
  ...pagination,
  search: z.string().trim().max(120).optional(),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
};

export const rentalRequestReportQuerySchema = z
  .object({
    ...reportListBase,
    status: z
      .enum([
        'SUBMITTED',
        'RE_REVIEW_REQUIRED',
        'UNDER_REVIEW',
        'APPROVED',
        'PARTIALLY_APPROVED',
        'REJECTED',
      ])
      .optional(),
  })
  .strict()
  .superRefine(validateCustomRange);

export const quoteOrderReportQuerySchema = z
  .object({
    ...reportListBase,
    quoteStatus: z
      .enum([
        'DRAFT',
        'SENT',
        'VIEWED',
        'ACCEPTED',
        'REJECTED',
        'EXPIRED',
        'SUPERSEDED',
      ])
      .optional(),
    recordType: z.enum(['ALL', 'QUOTE', 'ORDER']).default('ALL'),
  })
  .strict()
  .superRefine(validateCustomRange);

export const rentalsReturnsReportQuerySchema = z
  .object({
    ...reportListBase,
    overdue: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    recordType: z.enum(['ALL', 'ACTIVE_RENTAL', 'RETURN']).default('ALL'),
  })
  .strict()
  .superRefine(validateCustomRange);

export const inventoryReportQuerySchema = z
  .object({
    ...reportListBase,
    action: z
      .enum([
        'INITIAL_STOCK',
        'MANUAL_ADJUSTMENT',
        'ASSET_CREATED',
        'CHECKOUT',
        'RETURN_TO_RENTABLE',
        'RETURN_TO_DAMAGED',
        'RETURN_TO_MAINTENANCE',
        'MARK_MISSING',
        'RECOVER_MISSING_TO_RENTABLE',
        'RECOVER_MISSING_TO_DAMAGED',
        'RECOVER_MISSING_TO_MAINTENANCE',
        'REPAIR_COMPLETE',
        'WRITE_OFF',
        'ENTER_MAINTENANCE',
        'MAINTENANCE_RETURN_TO_SERVICE',
        'MAINTENANCE_REMAINS_DAMAGED',
        'MAINTENANCE_CANCELLED_RELEASE',
      ])
      .optional(),
    categoryId: z.string().cuid().optional(),
    productId: z.string().cuid().optional(),
    trackingMode: z.enum(['BULK', 'SERIALIZED']).optional(),
  })
  .strict()
  .superRefine(validateCustomRange);

export const maintenanceReportQuerySchema = z
  .object({
    ...reportListBase,
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    recordType: z.enum(['ALL', 'WORK_ORDER', 'INSPECTION']).default('ALL'),
    status: z
      .enum([
        'OPEN',
        'ASSIGNED',
        'IN_PROGRESS',
        'WAITING_FOR_PARTS',
        'READY_FOR_INSPECTION',
        'COMPLETED',
        'CANCELLED',
        'SCHEDULED',
        'PASSED',
        'FAILED',
      ])
      .optional(),
  })
  .strict()
  .superRefine(validateCustomRange);

export const reportKeySchema = z.enum([
  'rental-requests',
  'quotes-orders',
  'rentals-returns',
  'inventory',
  'maintenance',
]);

export type ReportOverviewQuery = z.infer<typeof reportOverviewQuerySchema>;
export type RentalRequestReportQuery = z.infer<
  typeof rentalRequestReportQuerySchema
>;
export type QuoteOrderReportQuery = z.infer<typeof quoteOrderReportQuerySchema>;
export type RentalsReturnsReportQuery = z.infer<
  typeof rentalsReturnsReportQuerySchema
>;
export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>;
export type MaintenanceReportQuery = z.infer<
  typeof maintenanceReportQuerySchema
>;
export type ReportKey = z.infer<typeof reportKeySchema>;

export class ReportingValidationPipe<T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message: 'Invalid reporting request',
        statusCode: 422,
      });
    }
    return parsed.data;
  }
}
