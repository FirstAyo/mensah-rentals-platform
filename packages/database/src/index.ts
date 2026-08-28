import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  mensahPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.mensahPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.mensahPrisma = prisma;
}

export { runRbacSeed } from './rbac-seed';
export { cleanupExpiredData } from './expired-cleanup';
export type {
  ExpiredCleanupOptions,
  ExpiredCleanupResult,
} from './expired-cleanup';

export {
  InventoryState,
  InventoryTrackingMode,
  InventoryTransactionKind,
  InventoryTransactionAction,
  InventoryReservationItemType,
  InventoryReservationOperationType,
  InventoryReservationStatus,
  InventoryReservationCoverageStatus,
  ReservationShortfallResolutionType,
  ReservationShortfallStatus,
  RentalRequestActivityType,
  RentalRequestDecisionOutcome,
  RentalRequestRevisionSubmitterType,
  RentalRequestStatus,
  RentalChangeRequestItemType,
  RentalChangeRequestStatus,
  QuoteActivityType,
  QuoteChargeType,
  QuoteCustomerResponseKind,
  QuoteRevisionState,
  RentalOrderActivityType,
  RentalOrderReservationStatus,
  RentalOrderStatus,
  SerializedAssetAllocationStatus,
  ActiveRentalStatus,
  RentalReturnStatus,
  RentalReturnDisposition,
  RentalIssueType,
  RentalIssueStatus,
  RentalIssueResolutionOutcome,
  ReturnActivityType,
  FulfilmentHandoffType,
  FulfilmentOperationType,
  OrderFulfilmentStatus,
  MaintenanceWorkOrderSource,
  MaintenanceWorkOrderType,
  MaintenanceWorkOrderStatus,
  MaintenancePriority,
  MaintenanceCompletionOutcome,
  MaintenanceOperationType,
  EquipmentInspectionType,
  EquipmentInspectionStatus,
  EquipmentInspectionResult,
  PlatformFeatureKey,
  PlatformFeatureState,
  UserStatus,
  Prisma,
} from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
