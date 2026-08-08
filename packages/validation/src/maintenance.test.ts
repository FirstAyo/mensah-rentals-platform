import { describe, expect, it } from 'vitest';
import {
  completeMaintenanceWorkOrderSchema,
  createEquipmentInspectionSchema,
  createMaintenanceWorkOrderSchema,
  maintenanceWorkOrderListQuerySchema,
  updateMaintenanceWorkOrderSchema,
} from './maintenance';

const id = 'cm12345678901234567890123';
const operationId = '00000000-0000-4000-8000-000000000001';

describe('maintenance validation', () => {
  it('accepts a bounded manual bulk work order', () => {
    expect(
      createMaintenanceWorkOrderSchema.parse({
        description: 'Inspect and service before the next rental.',
        inventoryId: id,
        operationId,
        quantity: 2,
        source: 'MANUAL',
        sourceState: 'RENTABLE',
        title: 'Preventive service',
        type: 'PREVENTIVE',
      }),
    ).toMatchObject({ priority: 'NORMAL', quantity: 2 });
  });

  it('requires the source reference matching the selected source', () => {
    const result = createMaintenanceWorkOrderSchema.safeParse({
      description: 'Repair returned equipment.',
      inventoryId: id,
      operationId,
      quantity: 1,
      source: 'RETURN_ISSUE',
      sourceRentalReturnItemId: id,
      title: 'Corrective repair',
      type: 'CORRECTIVE',
    });
    expect(result.success).toBe(false);
  });

  it('requires version information when resolving a linked issue', () => {
    const result = completeMaintenanceWorkOrderSchema.safeParse({
      completionOutcome: 'RETURN_TO_SERVICE',
      completionSummary: 'Repair completed.',
      expectedVersion: 3,
      operationId,
      resolveLinkedIssueAsRepaired: true,
    });
    expect(result.success).toBe(false);
  });

  it('enforces post-maintenance inspection source shape', () => {
    expect(
      createEquipmentInspectionSchema.safeParse({
        inventoryId: id,
        operationId,
        quantity: 1,
        scheduledFor: '2026-08-10T09:00:00.000Z',
        type: 'POST_MAINTENANCE',
      }).success,
    ).toBe(false);
  });

  it('rejects empty updates and bounds list queries', () => {
    expect(
      updateMaintenanceWorkOrderSchema.safeParse({
        expectedVersion: 0,
        operationId,
      }).success,
    ).toBe(false);
    expect(
      maintenanceWorkOrderListQuerySchema.safeParse({ pageSize: '101' })
        .success,
    ).toBe(false);
  });
});
