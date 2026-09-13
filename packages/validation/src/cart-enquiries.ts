import { z } from 'zod';

export const customerSubmissionModes = [
  'EMAIL_INQUIRY',
  'PLATFORM_REQUEST',
] as const;
export const customerSubmissionModeSchema = z.enum(customerSubmissionModes);

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const submitCartEnquirySchema = z
  .object({
    operationId: z.string().uuid(),
    customerName: z.string().trim().min(2).max(160),
    contactEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    contactPhone: z.string().trim().min(5).max(40),
    company: optional(160),
    projectName: optional(180),
    rentalStartDate: date,
    rentalEndDate: date,
    fulfilmentMethod: z.enum(['PICKUP', 'DELIVERY', 'DELIVERY_AND_SETUP']),
    location: optional(300),
    additionalEquipment: optional(1500),
    customerNotes: optional(3000),
    website: z.string().max(0).default(''),
  })
  .strict()
  .refine((value) => value.rentalEndDate >= value.rentalStartDate, {
    path: ['rentalEndDate'],
    message: 'The rental end date cannot be before the start date.',
  });

export const customerWorkflowChangeSchema = z
  .object({
    mode: customerSubmissionModeSchema,
    expectedVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
  })
  .strict();

export const cartEnquiryStatusSchema = z.enum(['NEW', 'READ', 'RESOLVED']);
export const updateCartEnquiryStatusSchema = z
  .object({
    status: cartEnquiryStatusSchema,
    operationId: z.string().uuid(),
  })
  .strict();

export const cartEnquiryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).default(''),
    status: cartEnquiryStatusSchema.optional(),
    deliveryStatus: z
      .enum(['QUEUED', 'PROCESSING', 'SENT', 'FAILED'])
      .optional(),
  })
  .strict();

export const retryOutboundEmailSchema = z
  .object({ operationId: z.string().uuid() })
  .strict();

export const publicCartEnquiryReceiptSchema = z
  .object({
    accepted: z.literal(true),
    message: z.string().min(1).max(500),
    referenceNumber: z.string().max(32).nullable(),
  })
  .strict();

export type CustomerSubmissionMode = z.infer<
  typeof customerSubmissionModeSchema
>;
export type SubmitCartEnquiryInput = z.infer<typeof submitCartEnquirySchema>;
export type CustomerWorkflowChangeInput = z.infer<
  typeof customerWorkflowChangeSchema
>;
export type CartEnquiryStatusInput = z.infer<typeof cartEnquiryStatusSchema>;
export type UpdateCartEnquiryStatusInput = z.infer<
  typeof updateCartEnquiryStatusSchema
>;
export type CartEnquiryListQuery = z.infer<typeof cartEnquiryListQuerySchema>;
