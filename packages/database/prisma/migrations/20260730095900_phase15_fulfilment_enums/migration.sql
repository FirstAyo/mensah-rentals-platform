-- PostgreSQL requires new enum values to commit before later migrations use them.
ALTER TYPE "RentalOrderReservationStatus" ADD VALUE 'PARTIALLY_CONSUMED';
ALTER TYPE "RentalOrderReservationStatus" ADD VALUE 'CONSUMED';
ALTER TYPE "InventoryReservationStatus" ADD VALUE 'PARTIALLY_CONSUMED';
ALTER TYPE "InventoryReservationStatus" ADD VALUE 'CONSUMED';
ALTER TYPE "SerializedAssetAllocationStatus" ADD VALUE 'CONSUMED';

CREATE TYPE "OrderFulfilmentStatus" AS ENUM ('PREPARING','READY','PARTIALLY_CHECKED_OUT','CHECKED_OUT');
CREATE TYPE "FulfilmentOperationType" AS ENUM ('PREPARATION_STARTED','PREPARATION_UPDATED','MARKED_READY','CHECKOUT');
CREATE TYPE "ActiveRentalStatus" AS ENUM ('PARTIALLY_ACTIVE','ACTIVE');
CREATE TYPE "FulfilmentHandoffType" AS ENUM ('PICKUP','DELIVERY');
