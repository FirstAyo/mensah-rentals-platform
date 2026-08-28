import { z } from 'zod';

export const contactEnquiryTypeSchema = z.enum([
  'GENERAL',
  'RENTAL_PROJECT',
  'DELIVERY_PICKUP',
  'EXISTING_REQUEST',
  'OTHER',
]);

export const contactEnquiryStatusSchema = z.enum(['NEW', 'READ', 'RESOLVED']);

const optionalContactText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null)
    .optional()
    .default('');

export const submitContactEnquirySchema = z
  .object({
    company: optionalContactText(160),
    email: z
      .string()
      .trim()
      .email('Enter a valid email address.')
      .max(254)
      .transform((value) => value.toLowerCase()),
    enquiryType: contactEnquiryTypeSchema,
    message: z.string().trim().min(10).max(4000),
    name: z.string().trim().min(2).max(160),
    operationId: z.string().uuid(),
    phone: optionalContactText(40),
    website: z.string().trim().max(200).optional().default(''),
  })
  .strict();

export const contactEnquiryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(100).optional(),
    status: contactEnquiryStatusSchema.optional(),
  })
  .strict();

export const updateContactEnquiryStatusSchema = z
  .object({
    operationId: z.string().uuid(),
    status: contactEnquiryStatusSchema,
  })
  .strict();

export type SubmitContactEnquiryInput = z.infer<
  typeof submitContactEnquirySchema
>;
export type SubmitContactEnquiryFormInput = z.input<
  typeof submitContactEnquirySchema
>;
export type ContactEnquiryListQuery = z.infer<
  typeof contactEnquiryListQuerySchema
>;
export type UpdateContactEnquiryStatusInput = z.infer<
  typeof updateContactEnquiryStatusSchema
>;
