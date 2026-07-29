import { z } from 'zod';

const operationId = z.string().uuid();
const expectedVersion = z.number().int().min(0);
const boundedNote = z.string().trim().min(1).max(2_000);
const quantity = z.number().int().min(0).max(1_000_000);
const disposition = z.enum(['RENTABLE', 'DAMAGED', 'MAINTENANCE', 'MISSING']);

const serializedOutcome = z
  .object({
    activeRentalSerializedAssetId: z.string().cuid(),
    disposition,
    inspectionNotes: boundedNote.optional(),
  })
  .strict();

const returnItem = z
  .object({
    activeRentalItemId: z.string().cuid(),
    quantityRentable: quantity.default(0),
    quantityDamaged: quantity.default(0),
    quantityMaintenance: quantity.default(0),
    quantityMissing: quantity.default(0),
    serializedAssets: z.array(serializedOutcome).max(1_000).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.quantityRentable +
        value.quantityDamaged +
        value.quantityMaintenance +
        value.quantityMissing >
      0,
    { message: 'At least one returned or confirmed-missing item is required.' },
  );

export const recordReturnSchema = z
  .object({
    operationId,
    expectedVersion,
    receivedAt: z.string().datetime({ offset: true }),
    internalNotes: boundedNote.optional(),
    customerSafeNotes: boundedNote.optional(),
    items: z.array(returnItem).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const itemIds = new Set<string>();
    const assetIds = new Set<string>();
    value.items.forEach((item, itemIndex) => {
      if (itemIds.has(item.activeRentalItemId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each active rental item may appear only once.',
          path: ['items', itemIndex, 'activeRentalItemId'],
        });
      itemIds.add(item.activeRentalItemId);
      item.serializedAssets.forEach((asset, assetIndex) => {
        if (assetIds.has(asset.activeRentalSerializedAssetId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Each serialized checkout occurrence may appear only once.',
            path: [
              'items',
              itemIndex,
              'serializedAssets',
              assetIndex,
              'activeRentalSerializedAssetId',
            ],
          });
        assetIds.add(asset.activeRentalSerializedAssetId);
      });
      const counts = item.serializedAssets.reduce(
        (result, asset) => {
          result[asset.disposition] += 1;
          return result;
        },
        { RENTABLE: 0, DAMAGED: 0, MAINTENANCE: 0, MISSING: 0 },
      );
      const fields = {
        RENTABLE: 'quantityRentable',
        DAMAGED: 'quantityDamaged',
        MAINTENANCE: 'quantityMaintenance',
        MISSING: 'quantityMissing',
      } as const;
      for (const state of disposition.options) {
        const field = fields[state];
        if (item.serializedAssets.length > 0 && item[field] !== counts[state])
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Serialized ${state.toLowerCase()} selections must match the quantity.`,
            path: ['items', itemIndex, field],
          });
      }
    });
  });

export const returnListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    status: z
      .enum([
        'PARTIALLY_RETURNED',
        'RECONCILIATION_REQUIRED',
        'READY_TO_COMPLETE',
        'COMPLETED',
      ])
      .optional(),
  })
  .strict();

export const issueListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    status: z
      .enum([
        'OPEN',
        'UNDER_REVIEW',
        'CUSTOMER_CONTACTED',
        'AWAITING_ITEM_RETURN',
        'AWAITING_INSPECTION',
        'AWAITING_REPAIR',
        'AWAITING_PAYMENT',
        'RESOLVED',
      ])
      .optional(),
    type: z
      .enum([
        'MISSING',
        'DAMAGED',
        'MAINTENANCE_REQUIRED',
        'LATE_RETURN',
        'WRONG_ITEM_RETURNED',
        'UNRESOLVED_QUANTITY',
      ])
      .optional(),
  })
  .strict();

export const returnVersionCommandSchema = z
  .object({ operationId, expectedVersion })
  .strict();

export const createRentalIssueSchema = z
  .object({
    operationId,
    expectedReturnVersion: expectedVersion,
    activeRentalItemId: z.string().cuid().optional(),
    type: z.enum(['LATE_RETURN', 'WRONG_ITEM_RETURNED', 'UNRESOLVED_QUANTITY']),
    quantity: z.number().int().min(1).max(1_000_000),
    blocksCompletion: z.boolean().default(true),
    internalDescription: boundedNote,
    customerSafeDescription: boundedNote.optional(),
  })
  .strict();

export const resolveRentalIssueSchema = z
  .object({
    operationId,
    expectedIssueVersion: expectedVersion,
    expectedReturnVersion: expectedVersion,
    outcome: z.enum([
      'ITEM_RETURNED',
      'REPAIRED',
      'PAID',
      'WAIVED',
      'WRITTEN_OFF',
      'REPLACED',
      'OTHER',
    ]),
    quantity: z.number().int().min(1).max(1_000_000),
    resultingInventoryState: z
      .enum(['RENTABLE', 'DAMAGED', 'MAINTENANCE', 'LOST', 'RETIRED'])
      .optional(),
    assessedCentsDelta: z.number().int().min(0).max(100_000_000).default(0),
    paidCentsDelta: z.number().int().min(0).max(100_000_000).default(0),
    internalReason: boundedNote,
    customerSafeNote: boundedNote.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const physical = ['ITEM_RETURNED', 'REPAIRED', 'WRITTEN_OFF'].includes(
      value.outcome,
    );
    if (physical && value.quantity < 1)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'Physical resolutions require a positive quantity.',
      });
    if (physical && !value.resultingInventoryState)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resultingInventoryState'],
        message: 'Physical resolutions require a resulting inventory state.',
      });
    if (!physical && value.resultingInventoryState)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resultingInventoryState'],
        message: 'Non-physical resolutions cannot move inventory.',
      });
    if (value.outcome === 'PAID' && value.paidCentsDelta < 1)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paidCentsDelta'],
        message: 'Paid resolutions require a positive paid amount.',
      });
    if (value.outcome !== 'PAID' && value.paidCentsDelta !== 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paidCentsDelta'],
        message: 'Only paid resolutions may record a paid amount.',
      });
  });

export type RecordReturnInput = z.infer<typeof recordReturnSchema>;
export type ReturnListQuery = z.infer<typeof returnListQuerySchema>;
export type IssueListQuery = z.infer<typeof issueListQuerySchema>;
export type ReturnVersionCommandInput = z.infer<
  typeof returnVersionCommandSchema
>;
export type CreateRentalIssueInput = z.infer<typeof createRentalIssueSchema>;
export type ResolveRentalIssueInput = z.infer<typeof resolveRentalIssueSchema>;
