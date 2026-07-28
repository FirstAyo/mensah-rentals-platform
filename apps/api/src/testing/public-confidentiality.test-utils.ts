import { expect } from 'vitest';

export const FORBIDDEN_PUBLIC_KEYS = [
  'totalQuantity',
  'availableQuantity',
  'remainingQuantity',
  'reservedQuantity',
  'rentedQuantity',
  'damagedQuantity',
  'maintenanceQuantity',
  'lostQuantity',
  'inventoryStateBalances',
  'assetNumber',
  'serialNumber',
  'dateBasedAvailability',
  'passwordHash',
  'sessionToken',
  'tokenHash',
  'roles',
  'permissionKeys',
  'storageKey',
  'filesystemPath',
  'staffIdentity',
  'internalStaffNotes',
  'assignedStaffId',
  'internalRejectionReason',
  'internalReason',
  'decidedBy',
  'decidedByUserId',
  'decisionId',
  'operationId',
  'payloadHash',
  'reviewVersionBefore',
  'reviewVersionAfter',
  'internalAvailabilityAssessment',
  'inventoryContext',
  'assignedTo',
  'assignedToUserId',
  'assignedAt',
  'reviewStartedAt',
  'reviewVersion',
  'internalNotes',
  'activities',
  'activity',
  'history',
  'actorUserId',
  'previousAssigneeUserId',
  'newAssigneeUserId',
  'noteId',
  'internalInventoryContext',
  'internalReviewState',
  'auditData',
  'quotePrice',
  'unitPrice',
  'accessTokenHash',
  'capabilityHash',
  'createdByUserId',
  'sentByUserId',
  'rentalRequestDecisionId',
  'lifecycleVersion',
  'reservationId',
  'reservationStatus',
  'shortfallQuantity',
  'availableToReserve',
  'overlappingReservedQuantity',
  'serializedAssetId',
  'allocationId',
  'rentalOrderId',
] as const;

export function expectPublicDataSafe(value: unknown): void {
  const keys: string[] = [];
  const strings: string[] = [];
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) return candidate.forEach(visit);
    if (!candidate || typeof candidate !== 'object') {
      if (typeof candidate === 'string') strings.push(candidate);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      keys.push(key);
      visit(nested);
    }
  };
  visit(value);
  const normalized = new Set(keys.map((key) => key.toLowerCase()));
  for (const key of FORBIDDEN_PUBLIC_KEYS)
    expect(
      normalized.has(key.toLowerCase()),
      `forbidden public key ${key}`,
    ).toBe(false);
  expect(strings.join(' ')).not.toMatch(
    /(?:[a-z]:\\|\/var\/|\/etc\/|storage[\\/]media[\\/])/i,
  );
}
