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
  InventoryReservationItemType,
  InventoryReservationOperationType,
  InventoryReservationStatus,
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
  FulfilmentHandoffType,
  FulfilmentOperationType,
  OrderFulfilmentStatus,
  UserStatus,
  Prisma,
} from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
