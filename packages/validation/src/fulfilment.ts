import { z } from 'zod';

const operationId = z.string().uuid();
const expectedVersion = z.number().int().min(0);
const internalNote = z.string().trim().min(1).max(2000);
const itemTarget = z
  .object({
    rentalOrderItemId: z.string().cuid(),
    quantity: z.number().int().min(0).max(1_000_000),
    serializedAllocationIds: z.array(z.string().cuid()).max(1000).default([]),
  })
  .strict();

const uniqueItems = z
  .array(itemTarget)
  .min(1)
  .max(100)
  .superRefine((items, context) => {
    const itemIds = new Set<string>();
    const allocationIds = new Set<string>();
    items.forEach((item, itemIndex) => {
      if (itemIds.has(item.rentalOrderItemId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each order item may appear only once.',
          path: [itemIndex, 'rentalOrderItemId'],
        });
      itemIds.add(item.rentalOrderItemId);
      item.serializedAllocationIds.forEach((id, allocationIndex) => {
        if (allocationIds.has(id))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each serialized allocation may appear only once.',
            path: [itemIndex, 'serializedAllocationIds', allocationIndex],
          });
        allocationIds.add(id);
      });
    });
  });

const checkoutItems = z
  .array(
    itemTarget.extend({
      externalQuantity: z.number().int().min(0).max(1_000_000).default(0),
    }),
  )
  .min(1)
  .max(100)
  .superRefine((items, context) => {
    const itemIds = new Set<string>();
    const allocationIds = new Set<string>();
    items.forEach((item, itemIndex) => {
      if (itemIds.has(item.rentalOrderItemId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each order item may appear only once.',
          path: [itemIndex, 'rentalOrderItemId'],
        });
      itemIds.add(item.rentalOrderItemId);
      item.serializedAllocationIds.forEach((id, allocationIndex) => {
        if (allocationIds.has(id))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each serialized allocation may appear only once.',
            path: [itemIndex, 'serializedAllocationIds', allocationIndex],
          });
        allocationIds.add(id);
      });
    });
  });

export const startPreparationSchema = z
  .object({ operationId, expectedReservationVersion: expectedVersion })
  .strict();
export const updatePreparationSchema = z
  .object({
    operationId,
    expectedVersion,
    items: uniqueItems,
    internalNote: internalNote.optional(),
  })
  .strict();
export const markFulfilmentReadySchema = z
  .object({ operationId, expectedVersion })
  .strict();

export const checkoutFulfilmentSchema = z
  .object({
    operationId,
    expectedVersion,
    expectedReservationVersion: expectedVersion,
    allowPartial: z.boolean(),
    internalReason: internalNote.optional(),
    items: checkoutItems,
    handoffAt: z.string().datetime({ offset: true }),
    recipientName: z.string().trim().min(1).max(200).optional(),
    acknowledgementReference: z.string().trim().min(1).max(500).optional(),
    internalNotes: internalNote.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allowPartial && !value.internalReason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An internal reason is required for partial checkout.',
        path: ['internalReason'],
      });
    if (!value.allowPartial && value.internalReason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An internal reason is only accepted for partial checkout.',
        path: ['internalReason'],
      });
  });

export const activeRentalListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    status: z.enum(['PARTIALLY_ACTIVE', 'ACTIVE']).optional(),
    overdue: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    fulfillmentMethod: z
      .enum(['PICKUP', 'DELIVERY', 'DELIVERY_AND_SETUP'])
      .optional(),
  })
  .strict();

export type StartPreparationInput = z.infer<typeof startPreparationSchema>;
export type UpdatePreparationInput = z.infer<typeof updatePreparationSchema>;
export type MarkFulfilmentReadyInput = z.infer<
  typeof markFulfilmentReadySchema
>;
export type CheckoutFulfilmentInput = z.infer<typeof checkoutFulfilmentSchema>;
export type ActiveRentalListQuery = z.infer<typeof activeRentalListQuerySchema>;
