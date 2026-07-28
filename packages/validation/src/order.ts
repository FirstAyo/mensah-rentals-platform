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

export const orderAccessOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedAccessId: z.string().uuid().optional(),
  })
  .strict();

export const rentalOrderListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    status: z.literal('CONFIRMED').optional(),
    reservationStatus: z
      .enum([
        'NOT_RESERVED',
        'PARTIALLY_RESERVED',
        'RESERVED',
        'RESERVATION_FAILED',
        'RELEASED',
      ])
      .optional(),
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
export type OrderAccessOperationInput = z.infer<
  typeof orderAccessOperationSchema
>;
export type RentalOrderListQuery = z.infer<typeof rentalOrderListQuerySchema>;

const reservationOperationId = z.string().uuid();
const reservationExpectedVersion = z.number().int().min(0);
const reservationReason = z.string().trim().min(1).max(2000);
const serializedSelectionSchema = z
  .object({
    rentalOrderItemId: z.string().cuid(),
    serializedAssetIds: z.array(z.string().cuid()).max(1000),
  })
  .strict();

const uniqueSerializedSelections = z
  .array(serializedSelectionSchema)
  .max(100)
  .superRefine((items, context) => {
    const orderItems = new Set<string>();
    const assets = new Set<string>();
    items.forEach((item, itemIndex) => {
      if (orderItems.has(item.rentalOrderItemId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each order item may have only one asset selection.',
          path: [itemIndex, 'rentalOrderItemId'],
        });
      orderItems.add(item.rentalOrderItemId);
      item.serializedAssetIds.forEach((assetId, assetIndex) => {
        if (assets.has(assetId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each serialized asset may be selected only once.',
            path: [itemIndex, 'serializedAssetIds', assetIndex],
          });
        assets.add(assetId);
      });
    });
  });

export const createInventoryReservationSchema = z
  .object({
    allowPartial: z.boolean(),
    operationId: reservationOperationId,
    overrideReason: reservationReason.optional(),
    serializedSelections: uniqueSerializedSelections.default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowPartial && !value.overrideReason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A reason is required for intentional partial reservation.',
        path: ['overrideReason'],
      });
    if (!value.allowPartial && value.overrideReason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'An override reason is only valid for intentional partial reservation.',
        path: ['overrideReason'],
      });
  });

export const completeInventoryReservationSchema = z
  .object({
    allowPartial: z.boolean().default(false),
    expectedVersion: reservationExpectedVersion,
    operationId: reservationOperationId,
    overrideReason: reservationReason.optional(),
    serializedSelections: uniqueSerializedSelections.default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowPartial && !value.overrideReason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A reason is required for intentional partial reservation.',
        path: ['overrideReason'],
      });
    if (!value.allowPartial && value.overrideReason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'An override reason is only valid for intentional partial reservation.',
        path: ['overrideReason'],
      });
  });

const releaseReservationItemSchema = z
  .object({
    allocationIds: z.array(z.string().cuid()).max(1000).default([]),
    quantity: z.number().int().min(1).max(1_000_000).optional(),
    rentalOrderItemId: z.string().cuid(),
  })
  .strict()
  .refine(
    (value) =>
      (value.quantity !== undefined && value.allocationIds.length === 0) ||
      (value.quantity === undefined && value.allocationIds.length > 0),
    'Choose either a bulk quantity or serialized allocations, not both.',
  );

export const releaseInventoryReservationSchema = z
  .object({
    expectedVersion: reservationExpectedVersion,
    items: z
      .array(releaseReservationItemSchema)
      .max(100)
      .superRefine((items, context) => {
        const seen = new Set<string>();
        items.forEach((item, index) => {
          if (seen.has(item.rentalOrderItemId))
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Each order item may appear only once.',
              path: [index, 'rentalOrderItemId'],
            });
          seen.add(item.rentalOrderItemId);
        });
      })
      .optional(),
    operationId: reservationOperationId,
    reason: reservationReason,
  })
  .strict();

export const eligibleAssetsQuerySchema = z
  .object({ rentalOrderItemId: z.string().cuid() })
  .strict();

export type CreateInventoryReservationInput = z.infer<
  typeof createInventoryReservationSchema
>;
export type CompleteInventoryReservationInput = z.infer<
  typeof completeInventoryReservationSchema
>;
export type ReleaseInventoryReservationInput = z.infer<
  typeof releaseInventoryReservationSchema
>;
export type EligibleAssetsQuery = z.infer<typeof eligibleAssetsQuerySchema>;
