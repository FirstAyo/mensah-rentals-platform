import { z } from 'zod';

export const createRentalOrderSchema = z
  .object({ operationId: z.string().uuid() })
  .strict();

export const orderCustomerAccessSchema = z
  .object({
    capability: z
      .string()
      .regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/)
      .max(100),
  })
  .strict();

export const rentalOrderListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    status: z.literal('CONFIRMED').optional(),
    reservationStatus: z.literal('NOT_RESERVED').optional(),
    fulfillmentMethod: z
      .enum(['PICKUP', 'DELIVERY', 'DELIVERY_AND_SETUP'])
      .optional(),
    rentalStartFrom: z.string().date().optional(),
    rentalStartTo: z.string().date().optional(),
    sortBy: z
      .enum(['confirmedAt', 'rentalStartDate', 'total'])
      .default('confirmedAt'),
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
        message: 'Rental date filter range is invalid.',
        path: ['rentalStartTo'],
      });
  });

export type CreateRentalOrderInput = z.infer<typeof createRentalOrderSchema>;
export type OrderCustomerAccessInput = z.infer<
  typeof orderCustomerAccessSchema
>;
export type RentalOrderListQuery = z.infer<typeof rentalOrderListQuerySchema>;
