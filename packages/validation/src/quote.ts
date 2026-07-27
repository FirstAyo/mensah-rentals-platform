import { z } from 'zod';

export const QUOTE_MONEY_LIMITS = {
  maxAggregateCents: 100_000_000_000_000,
  maxAmountCents: 100_000_000,
  maxCharges: 25,
  maxItems: 100,
  maxQuantity: 1_000,
  maxTaxBasisPoints: 10_000,
} as const;

const operationId = z.string().uuid();
const cents = z.number().int().min(0).max(QUOTE_MONEY_LIMITS.maxAmountCents);
const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null)
    .nullable()
    .optional();

export const quoteChargeTypeSchema = z.enum([
  'DELIVERY',
  'PICKUP',
  'SETUP',
  'TEARDOWN',
  'LABOUR',
  'OTHER',
]);

export const quoteRevisionInputSchema = z
  .object({
    operationId,
    expectedLatestRevisionNumber: z.number().int().min(1).optional(),
    items: z
      .array(
        z
          .object({
            rentalRequestDecisionItemId: z.string().cuid(),
            quotedQuantity: z.number().int().min(1).max(1_000),
            unitPriceCents: cents,
            taxable: z.boolean().default(true),
          })
          .strict(),
      )
      .min(1)
      .max(QUOTE_MONEY_LIMITS.maxItems),
    charges: z
      .array(
        z
          .object({
            type: quoteChargeTypeSchema,
            label: z.string().trim().min(1).max(100),
            amountCents: cents,
            taxable: z.boolean().default(true),
          })
          .strict(),
      )
      .max(QUOTE_MONEY_LIMITS.maxCharges)
      .default([]),
    discountCents: cents.default(0),
    discountTaxable: z.boolean().default(true),
    tax: z
      .object({
        name: z.string().trim().min(1).max(80),
        rateBasisPoints: z.number().int().min(0).max(10_000),
      })
      .strict(),
    customerNotes: nullableText(3_000),
    internalNotes: nullableText(5_000),
    terms: nullableText(10_000),
    validUntil: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.items.forEach((item, index) => {
      if (ids.has(item.rentalRequestDecisionItemId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each approved decision item may appear only once.',
          path: ['items', index, 'rentalRequestDecisionItemId'],
        });
      ids.add(item.rentalRequestDecisionItemId);
    });
  });

export const sendQuoteRevisionSchema = z
  .object({
    operationId,
    expectedLifecycleVersion: z.number().int().min(0),
  })
  .strict();

export const quoteCustomerAccessSchema = z
  .object({
    capability: z
      .string()
      .regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/)
      .max(100),
  })
  .strict();

export const quoteCustomerResponseSchema = z
  .object({
    operationId,
    response: z.enum(['ACCEPTED', 'REJECTED']),
    note: nullableText(1_000),
  })
  .strict();

export const quoteListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    status: z
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
    validUntilFrom: z.string().datetime({ offset: true }).optional(),
    validUntilTo: z.string().datetime({ offset: true }).optional(),
    createdByUserId: z.string().cuid().optional(),
    sortBy: z.enum(['createdAt', 'total', 'validUntil']).default('createdAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type QuoteRevisionInput = z.infer<typeof quoteRevisionInputSchema>;
export type SendQuoteRevisionInput = z.infer<typeof sendQuoteRevisionSchema>;
export type QuoteCustomerAccessInput = z.infer<
  typeof quoteCustomerAccessSchema
>;
export type QuoteCustomerResponseInput = z.infer<
  typeof quoteCustomerResponseSchema
>;
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

export interface QuoteMoneyTotals {
  chargeTotalCents: bigint;
  itemSubtotalCents: bigint;
  subtotalCents: bigint;
  taxableSubtotalCents: bigint;
  taxCents: bigint;
  totalCents: bigint;
}

export function calculateQuoteMoney(input: {
  items: Array<{ quantity: number; unitPriceCents: number; taxable: boolean }>;
  charges: Array<{ amountCents: number; taxable: boolean }>;
  discountCents: number;
  discountTaxable: boolean;
  taxRateBasisPoints: number;
}): QuoteMoneyTotals {
  const itemSubtotalCents = input.items.reduce(
    (sum, item) => sum + BigInt(item.quantity) * BigInt(item.unitPriceCents),
    0n,
  );
  const chargeTotalCents = input.charges.reduce(
    (sum, charge) => sum + BigInt(charge.amountCents),
    0n,
  );
  const subtotalCents = itemSubtotalCents + chargeTotalCents;
  const discount = BigInt(input.discountCents);
  if (discount > subtotalCents) throw new Error('Discount exceeds subtotal');
  const taxableGross =
    input.items.reduce(
      (sum, item) =>
        sum +
        (item.taxable
          ? BigInt(item.quantity) * BigInt(item.unitPriceCents)
          : 0n),
      0n,
    ) +
    input.charges.reduce(
      (sum, charge) => sum + (charge.taxable ? BigInt(charge.amountCents) : 0n),
      0n,
    );
  if (input.discountTaxable && discount > taxableGross)
    throw new Error('Taxable discount exceeds taxable subtotal');
  const taxableSubtotalCents =
    taxableGross - (input.discountTaxable ? discount : 0n);
  const taxCents =
    (taxableSubtotalCents * BigInt(input.taxRateBasisPoints) + 5_000n) /
    10_000n;
  const totalCents = subtotalCents - discount + taxCents;
  for (const amount of [
    itemSubtotalCents,
    chargeTotalCents,
    subtotalCents,
    taxableSubtotalCents,
    taxCents,
    totalCents,
  ])
    if (amount < 0n || amount > BigInt(QUOTE_MONEY_LIMITS.maxAggregateCents))
      throw new Error('Quote amount exceeds the supported range');
  return {
    chargeTotalCents,
    itemSubtotalCents,
    subtotalCents,
    taxableSubtotalCents,
    taxCents,
    totalCents,
  };
}

export function parseCadToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [dollars, fraction = ''] = normalized.split('.');
  const result = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return result <= QUOTE_MONEY_LIMITS.maxAmountCents ? result : null;
}

export function parsePercentToBasisPoints(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [percent, fraction = ''] = normalized.split('.');
  const result = Number(percent) * 100 + Number(fraction.padEnd(2, '0'));
  return result <= QUOTE_MONEY_LIMITS.maxTaxBasisPoints ? result : null;
}
