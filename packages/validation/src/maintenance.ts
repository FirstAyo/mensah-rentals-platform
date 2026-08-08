import { z } from 'zod';

const cuid = z.string().cuid();
const operationId = z.string().uuid();
const expectedVersion = z.number().int().min(0);
const quantity = z.number().int().min(1).max(1_000_000);
const instant = z.string().datetime({ offset: true });
const nullableInstant = z.union([instant, z.null()]).optional();
const nullableCuid = z.union([cuid, z.null()]).optional();
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const optionalBooleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const maintenanceWorkOrderSourceSchema = z.enum([
  'MANUAL',
  'RETURN_ISSUE',
  'RETURN_DISPOSITION',
  'FAILED_INSPECTION',
]);
export const maintenanceWorkOrderTypeSchema = z.enum([
  'CORRECTIVE',
  'PREVENTIVE',
  'INSPECTION_FOLLOWUP',
]);
export const maintenanceWorkOrderStatusSchema = z.enum([
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'READY_FOR_INSPECTION',
  'COMPLETED',
  'CANCELLED',
]);
export const maintenancePrioritySchema = z.enum([
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
]);
export const equipmentInspectionTypeSchema = z.enum([
  'ROUTINE',
  'POST_MAINTENANCE',
]);
export const equipmentInspectionStatusSchema = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'CANCELLED',
]);

export const maintenanceWorkOrderListQuerySchema = z
  .object({
    page,
    pageSize,
    search: z.string().trim().max(160).optional(),
    status: maintenanceWorkOrderStatusSchema.optional(),
    source: maintenanceWorkOrderSourceSchema.optional(),
    priority: maintenancePrioritySchema.optional(),
    type: maintenanceWorkOrderTypeSchema.optional(),
    assignedToUserId: cuid.optional(),
    inventoryId: cuid.optional(),
    inventoryItemId: cuid.optional(),
    overdue: optionalBooleanQuery,
    sortBy: z
      .enum(['createdAt', 'updatedAt', 'scheduledFor', 'dueAt', 'priority'])
      .default('updatedAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const maintenanceStaffQuerySchema = z
  .object({
    search: z.string().trim().max(160).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const equipmentInspectionListQuerySchema = z
  .object({
    page,
    pageSize,
    search: z.string().trim().max(160).optional(),
    status: equipmentInspectionStatusSchema.optional(),
    type: equipmentInspectionTypeSchema.optional(),
    assignedToUserId: cuid.optional(),
    inventoryId: cuid.optional(),
    inventoryItemId: cuid.optional(),
    overdue: optionalBooleanQuery,
    sortBy: z
      .enum(['createdAt', 'updatedAt', 'scheduledFor'])
      .default('scheduledFor'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const createMaintenanceWorkOrderSchema = z
  .object({
    operationId,
    source: maintenanceWorkOrderSourceSchema,
    type: maintenanceWorkOrderTypeSchema,
    priority: maintenancePrioritySchema.default('NORMAL'),
    title: z.string().trim().min(1, 'Enter a work-order title.').max(160),
    description: z.string().trim().min(1, 'Enter a description.').max(5_000),
    inventoryId: cuid,
    inventoryItemId: nullableCuid,
    sourceState: z.enum(['RENTABLE', 'DAMAGED', 'MAINTENANCE']).optional(),
    quantity,
    sourceRentalReturnItemId: nullableCuid,
    sourceRentalIssueId: nullableCuid,
    sourceInspectionId: nullableCuid,
    assignedStaffUserId: nullableCuid,
    scheduledFor: nullableInstant,
    dueAt: nullableInstant,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'MANUAL' && !value.sourceState)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceState'],
        message: 'Select the exact inventory state for manual maintenance.',
      });
    if (value.source !== 'MANUAL' && value.sourceState)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceState'],
        message: 'Source state is derived for linked maintenance work.',
      });
    const requiredSource = {
      FAILED_INSPECTION: 'sourceInspectionId',
      MANUAL: null,
      RETURN_DISPOSITION: 'sourceRentalReturnItemId',
      RETURN_ISSUE: 'sourceRentalIssueId',
    } as const;
    const expected = requiredSource[value.source];
    const fields = [
      'sourceRentalReturnItemId',
      'sourceRentalIssueId',
      'sourceInspectionId',
    ] as const;
    for (const field of fields)
      if ((field === expected) !== Boolean(value[field]))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message:
            field === expected
              ? 'This source reference is required.'
              : 'This source reference does not match the selected source.',
        });
    if (value.scheduledFor && value.dueAt && value.dueAt < value.scheduledFor)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAt'],
        message: 'Due time must be on or after the scheduled time.',
      });
  });

const workOrderVersionCommand = z.object({ operationId, expectedVersion });

export const assignMaintenanceWorkOrderSchema = workOrderVersionCommand
  .extend({ assignedStaffUserId: cuid })
  .strict();
export const unassignMaintenanceWorkOrderSchema =
  workOrderVersionCommand.strict();
export const maintenanceWorkOrderActionSchema = workOrderVersionCommand
  .extend({
    internalReason: z.string().trim().min(1).max(2_000).nullable().optional(),
  })
  .strict();

export const updateMaintenanceWorkOrderSchema = workOrderVersionCommand
  .extend({
    priority: maintenancePrioritySchema.optional(),
    scheduledFor: nullableInstant,
    dueAt: nullableInstant,
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(5_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.priority === undefined &&
      value.scheduledFor === undefined &&
      value.dueAt === undefined &&
      value.title === undefined &&
      value.description === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one work-order change.',
      });
    if (value.scheduledFor && value.dueAt && value.dueAt < value.scheduledFor)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAt'],
        message: 'Due time must be on or after the scheduled time.',
      });
  });

export const completeMaintenanceWorkOrderSchema = workOrderVersionCommand
  .extend({
    completionOutcome: z.enum(['RETURN_TO_SERVICE', 'REMAINS_DAMAGED']),
    completionSummary: z.string().trim().min(1).max(3_000),
    resolveLinkedIssueAsRepaired: z.boolean().default(false),
    expectedIssueVersion: expectedVersion.optional(),
    expectedReturnVersion: expectedVersion.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.resolveLinkedIssueAsRepaired &&
      (value.expectedIssueVersion === undefined ||
        value.expectedReturnVersion === undefined)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedIssueVersion'],
        message: 'Current linked-issue and return versions are required.',
      });
  });

export const cancelMaintenanceWorkOrderSchema = workOrderVersionCommand
  .extend({ cancellationReason: z.string().trim().min(1).max(3_000) })
  .strict();
export const addMaintenanceNoteSchema = workOrderVersionCommand
  .extend({ body: z.string().trim().min(1).max(3_000) })
  .strict();

export const createEquipmentInspectionSchema = z
  .object({
    operationId,
    type: equipmentInspectionTypeSchema,
    inventoryId: cuid,
    inventoryItemId: nullableCuid,
    quantity,
    sourceWorkOrderId: nullableCuid,
    assignedStaffUserId: nullableCuid,
    scheduledFor: instant,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === 'POST_MAINTENANCE' && !value.sourceWorkOrderId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceWorkOrderId'],
        message: 'A post-maintenance inspection requires a work order.',
      });
    if (value.type === 'ROUTINE' && value.sourceWorkOrderId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceWorkOrderId'],
        message:
          'A routine inspection cannot reference a maintenance work order.',
      });
  });

export const equipmentInspectionActionSchema = z
  .object({ operationId, expectedVersion })
  .strict();
export const completeEquipmentInspectionSchema = equipmentInspectionActionSchema
  .extend({ summary: z.string().trim().min(1).max(3_000) })
  .strict();
export const passEquipmentInspectionSchema = completeEquipmentInspectionSchema;
export const failEquipmentInspectionSchema = completeEquipmentInspectionSchema;
export const cancelEquipmentInspectionSchema = equipmentInspectionActionSchema
  .extend({ cancellationReason: z.string().trim().min(1).max(3_000) })
  .strict();

export type MaintenanceWorkOrderListQuery = z.infer<
  typeof maintenanceWorkOrderListQuerySchema
>;
export type MaintenanceStaffQuery = z.infer<typeof maintenanceStaffQuerySchema>;
export type EquipmentInspectionListQuery = z.infer<
  typeof equipmentInspectionListQuerySchema
>;
export type CreateMaintenanceWorkOrderInput = z.infer<
  typeof createMaintenanceWorkOrderSchema
>;
export type AssignMaintenanceWorkOrderInput = z.infer<
  typeof assignMaintenanceWorkOrderSchema
>;
export type UnassignMaintenanceWorkOrderInput = z.infer<
  typeof unassignMaintenanceWorkOrderSchema
>;
export type MaintenanceWorkOrderActionInput = z.infer<
  typeof maintenanceWorkOrderActionSchema
>;
export type UpdateMaintenanceWorkOrderInput = z.infer<
  typeof updateMaintenanceWorkOrderSchema
>;
export type CompleteMaintenanceWorkOrderInput = z.infer<
  typeof completeMaintenanceWorkOrderSchema
>;
export type CancelMaintenanceWorkOrderInput = z.infer<
  typeof cancelMaintenanceWorkOrderSchema
>;
export type AddMaintenanceNoteInput = z.infer<typeof addMaintenanceNoteSchema>;
export type CreateEquipmentInspectionInput = z.infer<
  typeof createEquipmentInspectionSchema
>;
export type EquipmentInspectionActionInput = z.infer<
  typeof equipmentInspectionActionSchema
>;
export type CompleteEquipmentInspectionInput = z.infer<
  typeof completeEquipmentInspectionSchema
>;
export type CancelEquipmentInspectionInput = z.infer<
  typeof cancelEquipmentInspectionSchema
>;
