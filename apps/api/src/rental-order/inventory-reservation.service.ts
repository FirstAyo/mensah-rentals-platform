import { createHash, randomBytes } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  InventoryReservationItemType,
  InventoryReservationOperationType,
  InventoryReservationStatus,
  InventoryState,
  InventoryTrackingMode,
  Prisma,
  RentalOrderReservationStatus,
  SerializedAssetAllocationStatus,
  UserStatus,
  prisma,
} from '@mensah-rentals/database';
import type {
  AdminEligibleAssetsResponse,
  AdminInventoryReservationResponse,
  AdminOrderAvailabilityResponse,
} from '@mensah-rentals/types';
import type {
  CompleteInventoryReservationInput,
  CreateInventoryReservationInput,
  ReleaseInventoryReservationInput,
} from '@mensah-rentals/validation';

const activeReservationStatuses = [
  InventoryReservationStatus.PENDING,
  InventoryReservationStatus.PARTIALLY_RESERVED,
  InventoryReservationStatus.RESERVED,
  InventoryReservationStatus.PARTIALLY_CONSUMED,
];
const availabilityNotice =
  'Internal operational availability. Never disclose quantities, shortfalls, or asset identifiers to customers.';

const reservationInclude = {
  items: {
    include: {
      rentalOrderItem: { select: { productNameSnapshot: true } },
      serializedAllocations: {
        include: {
          inventoryItem: {
            select: { assetNumber: true, serialNumber: true },
          },
        },
        orderBy: [{ allocatedAt: 'asc' as const }, { id: 'asc' as const }],
      },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  operations: {
    include: {
      actor: { select: { firstName: true, id: true, lastName: true } },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  rentalOrder: { select: { orderNumber: true } },
} satisfies Prisma.InventoryReservationInclude;

type ReservationRecord = Prisma.InventoryReservationGetPayload<{
  include: typeof reservationInclude;
}>;

@Injectable()
export class InventoryReservationService {
  async get(
    actorId: string,
    orderId: string,
  ): Promise<AdminInventoryReservationResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['inventory.reservation.view']);
      const reservation = await tx.inventoryReservation.findUnique({
        where: { rentalOrderId: orderId },
        include: reservationInclude,
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      return this.mapReservation(reservation);
    });
  }

  async availability(
    actorId: string,
    orderId: string,
  ): Promise<AdminOrderAvailabilityResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['inventory.availability.view']);
      const order = await this.requireEligibleOrder(tx, orderId);
      return this.calculateAvailability(tx, order);
    });
  }

  async create(
    actorId: string,
    orderId: string,
    input: CreateInventoryReservationInput,
  ): Promise<AdminInventoryReservationResponse> {
    const payloadHash = this.hash({ action: 'create', orderId, ...input });
    const reservationResult = await this.mutate(async (tx) => {
      await this.lockOrder(tx, orderId);
      await this.requireActor(tx, actorId, ['inventory.reservation.create']);
      const replay = await this.replay(
        tx,
        input.operationId,
        payloadHash,
        actorId,
        orderId,
      );
      if (replay) return { id: replay.id, failure: replay.failed };
      const order = await this.requireEligibleOrder(tx, orderId);
      if (order.reservation)
        throw new ConflictException('An active reservation already exists');
      const inventories = await this.lockInventoriesForOrder(tx, order);
      const range = this.orderRange(order);
      const reservation = await tx.inventoryReservation.create({
        data: {
          createdByUserId: actorId,
          rangeEndExclusiveUtc: range.end,
          rangeStartUtc: range.start,
          rentalEndDateSnapshot: order.rentalEndDateSnapshot,
          rentalOrderId: order.id,
          rentalStartDateSnapshot: order.rentalStartDateSnapshot,
          requestedTimeZoneSnapshot: order.requestedTimeZoneSnapshot,
          reservationNumber: this.reservationNumber(),
          status: InventoryReservationStatus.PENDING,
        },
      });
      const items = await Promise.all(
        order.items.map(async (orderItem) => {
          const inventory = inventories.get(orderItem.productIdSnapshot);
          if (!inventory)
            throw new UnprocessableEntityException(
              `No reservable inventory exists for ${orderItem.productNameSnapshot}`,
            );
          return tx.inventoryReservationItem.create({
            data: {
              inventoryId: inventory.id,
              inventoryReservationId: reservation.id,
              productIdSnapshot: orderItem.productIdSnapshot,
              rentalOrderItemId: orderItem.id,
              requestedQuantity: orderItem.quotedQuantity,
              reservationType:
                inventory.trackingMode === InventoryTrackingMode.BULK
                  ? InventoryReservationItemType.BULK
                  : InventoryReservationItemType.SERIALIZED,
              reservedQuantity: 0,
              shortfallQuantity: orderItem.quotedQuantity,
            },
          });
        }),
      );
      const plan = await this.planAdditionalAllocations(
        tx,
        reservation,
        items,
        input.serializedSelections,
      );
      const hasShortfall = plan.some(
        ({ committedAfter, requestedQuantity }) =>
          committedAfter < requestedQuantity,
      );
      const reservedTotal = plan.reduce(
        (sum, item) => sum + item.reservedAfter,
        0,
      );
      if (reservedTotal === 0 || (hasShortfall && !input.allowPartial)) {
        await tx.inventoryReservationOperation.create({
          data: {
            actorUserId: actorId,
            expectedVersion: 0,
            inventoryReservationId: reservation.id,
            metadata: {
              reason:
                reservedTotal === 0
                  ? 'NO_INTERNAL_ALLOCATION_AVAILABLE'
                  : 'INSUFFICIENT_INTERNAL_AVAILABILITY',
            },
            operationId: input.operationId,
            payloadHash,
            resultingVersion: 1,
            type: InventoryReservationOperationType.RESERVATION_FAILED,
          },
        });
        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: {
            status: InventoryReservationStatus.RESERVATION_FAILED,
            version: 1,
          },
        });
        await tx.rentalOrder.update({
          where: { id: order.id },
          data: {
            reservationStatus: RentalOrderReservationStatus.RESERVATION_FAILED,
            reservationVersion: { increment: 1 },
          },
        });
        return { id: reservation.id, failure: true };
      }
      await this.assertPartialPolicy(tx, actorId, input, hasShortfall);
      const nextStatus = hasShortfall
        ? InventoryReservationStatus.PARTIALLY_RESERVED
        : InventoryReservationStatus.RESERVED;
      const operation = await tx.inventoryReservationOperation.create({
        data: {
          actorUserId: actorId,
          expectedVersion: 0,
          inventoryReservationId: reservation.id,
          metadata: hasShortfall ? { intentionalPartial: true } : undefined,
          operationId: input.operationId,
          payloadHash,
          reason: hasShortfall ? input.overrideReason : null,
          resultingVersion: 1,
          type: hasShortfall
            ? InventoryReservationOperationType.RESERVATION_PARTIALLY_CREATED
            : InventoryReservationOperationType.RESERVATION_CREATED,
        },
      });
      await this.applyPlan(tx, operation.id, actorId, reservation, plan);
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: nextStatus, version: 1 },
      });
      await tx.rentalOrder.update({
        where: { id: order.id },
        data: {
          reservationStatus: this.orderStatus(nextStatus),
          reservationVersion: { increment: 1 },
        },
      });
      return { id: reservation.id, failure: false };
    });
    if (reservationResult.failure)
      throw new ConflictException(
        'Full reservation is not currently available',
      );
    return this.getWithNoPermissionCheck(reservationResult.id);
  }

  async complete(
    actorId: string,
    orderId: string,
    reservationId: string,
    input: CompleteInventoryReservationInput,
  ): Promise<AdminInventoryReservationResponse> {
    const payloadHash = this.hash({
      action: 'complete',
      orderId,
      reservationId,
      ...input,
    });
    const resultId = await this.mutate(async (tx) => {
      await this.lockOrder(tx, orderId);
      await this.requireActor(tx, actorId, ['inventory.reservation.update']);
      const replay = await this.replay(
        tx,
        input.operationId,
        payloadHash,
        actorId,
        orderId,
      );
      if (replay) return replay.id;
      await this.lockReservation(tx, reservationId);
      const order = await this.requireEligibleOrder(tx, orderId);
      const reservation = order.reservation;
      if (!reservation || reservation.id !== reservationId)
        throw new NotFoundException('Reservation not found');
      if (reservation.version !== input.expectedVersion)
        throw new ConflictException('Reservation version is stale');
      if (reservation.status === InventoryReservationStatus.RELEASED)
        throw new ConflictException(
          'Released reservations cannot be completed',
        );
      await this.lockInventoriesForOrder(tx, order);
      const plan = await this.planAdditionalAllocations(
        tx,
        reservation,
        reservation.items,
        input.serializedSelections,
      );
      if (!plan.some(({ quantityDelta }) => quantityDelta > 0))
        throw new ConflictException('No additional inventory can be reserved');
      const hasShortfall = plan.some(
        ({ committedAfter, requestedQuantity }) =>
          committedAfter < requestedQuantity,
      );
      await this.assertPartialPolicy(tx, actorId, input, hasShortfall);
      const nextVersion = reservation.version + 1;
      const hasConsumption = reservation.items.some(
        ({ consumedQuantity }) => consumedQuantity > 0,
      );
      const nextStatus = hasConsumption
        ? InventoryReservationStatus.PARTIALLY_CONSUMED
        : hasShortfall
          ? InventoryReservationStatus.PARTIALLY_RESERVED
          : InventoryReservationStatus.RESERVED;
      const operation = await tx.inventoryReservationOperation.create({
        data: {
          actorUserId: actorId,
          expectedVersion: reservation.version,
          inventoryReservationId: reservation.id,
          metadata: hasShortfall ? { intentionalPartial: true } : undefined,
          operationId: input.operationId,
          payloadHash,
          reason: hasShortfall ? input.overrideReason : null,
          resultingVersion: nextVersion,
          type: hasShortfall
            ? InventoryReservationOperationType.RESERVATION_QUANTITY_ADDED
            : InventoryReservationOperationType.RESERVATION_COMPLETED,
        },
      });
      await this.applyPlan(tx, operation.id, actorId, reservation, plan);
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: nextStatus, version: nextVersion },
      });
      await tx.rentalOrder.update({
        where: { id: orderId },
        data: {
          reservationStatus: this.orderStatus(nextStatus),
          reservationVersion: { increment: 1 },
        },
      });
      return reservation.id;
    });
    return this.getWithNoPermissionCheck(resultId);
  }

  async release(
    actorId: string,
    orderId: string,
    reservationId: string,
    input: ReleaseInventoryReservationInput,
  ): Promise<AdminInventoryReservationResponse> {
    const payloadHash = this.hash({
      action: 'release',
      orderId,
      reservationId,
      ...input,
    });
    const resultId = await this.mutate(async (tx) => {
      await this.lockOrder(tx, orderId);
      await this.requireActor(tx, actorId, ['inventory.reservation.release']);
      const replay = await this.replay(
        tx,
        input.operationId,
        payloadHash,
        actorId,
        orderId,
      );
      if (replay) return replay.id;
      await this.lockReservation(tx, reservationId);
      const reservation = await tx.inventoryReservation.findFirst({
        where: { id: reservationId, rentalOrderId: orderId },
        include: { items: { include: { serializedAllocations: true } } },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.version !== input.expectedVersion)
        throw new ConflictException('Reservation version is stale');
      if (
        reservation.items.every(
          ({ reservedQuantity }) => reservedQuantity === 0,
        )
      )
        throw new ConflictException(
          'The reservation has no active inventory to release',
        );
      const selection = input.items
        ? new Map(input.items.map((item) => [item.rentalOrderItemId, item]))
        : null;
      for (const itemId of selection?.keys() ?? [])
        if (
          !reservation.items.some((item) => item.rentalOrderItemId === itemId)
        )
          throw new UnprocessableEntityException(
            'Release item does not belong to this reservation',
          );
      let projectedReserved = reservation.items.reduce(
        (sum, item) => sum + item.reservedQuantity,
        0,
      );
      for (const item of reservation.items) {
        const requested = selection?.get(item.rentalOrderItemId);
        if (selection && !requested) continue;
        if (item.reservationType === InventoryReservationItemType.BULK) {
          const quantity = selection
            ? (requested?.quantity ?? 0)
            : item.reservedQuantity;
          if (quantity > item.reservedQuantity)
            throw new UnprocessableEntityException(
              'Release exceeds reserved quantity',
            );
          projectedReserved -= quantity;
        } else {
          const ids = selection
            ? (requested?.allocationIds ?? [])
            : item.serializedAllocations
                .filter(
                  ({ status }) =>
                    status === SerializedAssetAllocationStatus.ACTIVE,
                )
                .map(({ id }) => id);
          const allocations = item.serializedAllocations.filter(({ id }) =>
            ids.includes(id),
          );
          if (allocations.length !== ids.length)
            throw new UnprocessableEntityException(
              'Allocation does not belong to this reservation item',
            );
          if (
            selection &&
            allocations.some(
              ({ status }) => status !== SerializedAssetAllocationStatus.ACTIVE,
            )
          )
            throw new ConflictException(
              'One or more selected allocations are no longer active',
            );
          projectedReserved -= allocations.filter(
            ({ status }) => status === SerializedAssetAllocationStatus.ACTIVE,
          ).length;
        }
      }
      const nextVersion = reservation.version + 1;
      const operation = await tx.inventoryReservationOperation.create({
        data: {
          actorUserId: actorId,
          expectedVersion: reservation.version,
          inventoryReservationId: reservation.id,
          operationId: input.operationId,
          payloadHash,
          reason: input.reason,
          resultingVersion: nextVersion,
          type:
            projectedReserved === 0
              ? InventoryReservationOperationType.RESERVATION_RELEASED
              : InventoryReservationOperationType.RESERVATION_QUANTITY_RELEASED,
        },
      });
      for (const item of reservation.items) {
        const requested = selection?.get(item.rentalOrderItemId);
        if (selection && !requested) continue;
        if (item.reservationType === InventoryReservationItemType.BULK) {
          const quantity = selection
            ? (requested?.quantity ?? 0)
            : item.reservedQuantity;
          if (quantity > item.reservedQuantity)
            throw new UnprocessableEntityException(
              'Release exceeds reserved quantity',
            );
          if (quantity > 0) {
            await tx.inventoryReservationItem.update({
              where: { id: item.id },
              data: {
                reservedQuantity: { decrement: quantity },
                shortfallQuantity: { increment: quantity },
              },
            });
            await tx.inventoryReservationOperationItem.create({
              data: {
                quantityDelta: -quantity,
                reservationItemId: item.id,
                reservationOperationId: operation.id,
              },
            });
          }
        } else {
          const ids = selection
            ? (requested?.allocationIds ?? [])
            : item.serializedAllocations
                .filter(
                  ({ status }) =>
                    status === SerializedAssetAllocationStatus.ACTIVE,
                )
                .map(({ id }) => id);
          const allocations = item.serializedAllocations.filter(({ id }) =>
            ids.includes(id),
          );
          if (allocations.length !== ids.length)
            throw new UnprocessableEntityException(
              'Allocation does not belong to this reservation item',
            );
          const active = allocations.filter(
            ({ status }) => status === SerializedAssetAllocationStatus.ACTIVE,
          );
          if (active.length > 0) {
            await tx.serializedAssetAllocation.updateMany({
              where: {
                id: { in: active.map(({ id }) => id) },
                status: SerializedAssetAllocationStatus.ACTIVE,
              },
              data: {
                releasedAt: new Date(),
                releasedByUserId: actorId,
                releasedOperationId: operation.id,
                status: SerializedAssetAllocationStatus.RELEASED,
              },
            });
            await tx.inventoryReservationItem.update({
              where: { id: item.id },
              data: {
                reservedQuantity: { decrement: active.length },
                shortfallQuantity: { increment: active.length },
              },
            });
            for (const allocation of active)
              await tx.inventoryReservationOperationItem.create({
                data: {
                  inventoryItemId: allocation.inventoryItemId,
                  quantityDelta: -1,
                  reservationItemId: item.id,
                  reservationOperationId: operation.id,
                },
              });
          }
        }
      }
      const updatedItems = await tx.inventoryReservationItem.findMany({
        where: { inventoryReservationId: reservation.id },
        select: {
          consumedQuantity: true,
          requestedQuantity: true,
          reservedQuantity: true,
        },
      });
      const totalReserved = updatedItems.reduce(
        (sum, item) => sum + item.reservedQuantity,
        0,
      );
      const totalConsumed = updatedItems.reduce(
        (sum, item) => sum + item.consumedQuantity,
        0,
      );
      const nextStatus =
        totalConsumed > 0 && totalReserved === 0
          ? InventoryReservationStatus.CONSUMED
          : totalConsumed > 0
            ? InventoryReservationStatus.PARTIALLY_CONSUMED
            : totalReserved === 0
              ? InventoryReservationStatus.RELEASED
              : updatedItems.every(
                    (item) => item.reservedQuantity === item.requestedQuantity,
                  )
                ? InventoryReservationStatus.RESERVED
                : InventoryReservationStatus.PARTIALLY_RESERVED;
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: nextStatus, version: nextVersion },
      });
      await tx.rentalOrder.update({
        where: { id: orderId },
        data: {
          reservationStatus: this.orderStatus(nextStatus),
          reservationVersion: { increment: 1 },
        },
      });
      return reservation.id;
    });
    return this.getWithNoPermissionCheck(resultId);
  }

  async eligibleAssets(
    actorId: string,
    orderId: string,
    reservationId: string,
    rentalOrderItemId: string,
  ): Promise<AdminEligibleAssetsResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['inventory.availability.view']);
      const reservation = await tx.inventoryReservation.findFirst({
        where: { id: reservationId, rentalOrderId: orderId },
        include: { items: true },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      const item = reservation.items.find(
        (candidate) => candidate.rentalOrderItemId === rentalOrderItemId,
      );
      if (
        !item ||
        item.reservationType !== InventoryReservationItemType.SERIALIZED
      )
        throw new NotFoundException('Serialized reservation item not found');
      const items = await tx.inventoryItem.findMany({
        where: {
          inventoryId: item.inventoryId,
          status: InventoryState.RENTABLE,
          serializedAllocations: {
            none: {
              status: SerializedAssetAllocationStatus.ACTIVE,
              rangeStartUtc: { lt: reservation.rangeEndExclusiveUtc },
              rangeEndExclusiveUtc: { gt: reservation.rangeStartUtc },
            },
          },
        },
        orderBy: [{ assetNumber: 'asc' }, { id: 'asc' }],
        select: { assetNumber: true, id: true, serialNumber: true },
        take: 1000,
      });
      return { items, rentalOrderItemId };
    });
  }

  async eligibleAssetsForOrder(
    actorId: string,
    orderId: string,
    rentalOrderItemId: string,
  ): Promise<AdminEligibleAssetsResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['inventory.availability.view']);
      const order = await this.requireEligibleOrder(tx, orderId);
      const orderItem = order.items.find(({ id }) => id === rentalOrderItemId);
      if (!orderItem)
        throw new NotFoundException('Rental order item not found');
      const inventory = await tx.inventory.findUnique({
        where: { productId: orderItem.productIdSnapshot },
      });
      if (
        !inventory ||
        inventory.trackingMode !== InventoryTrackingMode.SERIALIZED
      )
        throw new NotFoundException('Serialized inventory is unavailable');
      const range = this.orderRange(order);
      const items = await tx.inventoryItem.findMany({
        where: {
          inventoryId: inventory.id,
          status: InventoryState.RENTABLE,
          serializedAllocations: {
            none: {
              status: SerializedAssetAllocationStatus.ACTIVE,
              rangeStartUtc: { lt: range.end },
              rangeEndExclusiveUtc: { gt: range.start },
            },
          },
        },
        orderBy: [{ assetNumber: 'asc' }, { id: 'asc' }],
        select: { assetNumber: true, id: true, serialNumber: true },
        take: 1000,
      });
      return { items, rentalOrderItemId };
    });
  }

  private async calculateAvailability(
    tx: Prisma.TransactionClient,
    order: EligibleOrder,
  ): Promise<AdminOrderAvailabilityResponse> {
    const range = this.orderRange(order);
    const inventories = await tx.inventory.findMany({
      where: {
        productId: {
          in: order.items.map(({ productIdSnapshot }) => productIdSnapshot),
        },
      },
    });
    const byProduct = new Map(
      inventories.map((inventory) => [inventory.productId, inventory]),
    );
    const items = await Promise.all(
      order.items.map(async (item) => {
        const inventory = byProduct.get(item.productIdSnapshot);
        if (!inventory)
          return {
            availableToReserve: 0,
            eligibleSerializedAssetCount: null,
            inventoryId: null,
            orderedQuantity: item.quotedQuantity,
            overlappingReservedQuantity: 0,
            physicalRentableQuantity: 0,
            productId: item.productIdSnapshot,
            productName: item.productNameSnapshot,
            rentalOrderItemId: item.id,
            shortfallQuantity: item.quotedQuantity,
            trackingMode: null,
          };
        if (inventory.trackingMode === InventoryTrackingMode.BULK) {
          const physical = await this.bulkRentable(tx, inventory.id);
          const overlapping = await this.overlappingBulk(
            tx,
            inventory.id,
            range.start,
            range.end,
          );
          const available = Math.max(0, physical - overlapping);
          return {
            availableToReserve: available,
            eligibleSerializedAssetCount: null,
            inventoryId: inventory.id,
            orderedQuantity: item.quotedQuantity,
            overlappingReservedQuantity: overlapping,
            physicalRentableQuantity: physical,
            productId: item.productIdSnapshot,
            productName: item.productNameSnapshot,
            rentalOrderItemId: item.id,
            shortfallQuantity: Math.max(0, item.quotedQuantity - available),
            trackingMode: inventory.trackingMode,
          };
        }
        const physical = await tx.inventoryItem.count({
          where: { inventoryId: inventory.id, status: InventoryState.RENTABLE },
        });
        const overlapping = await tx.serializedAssetAllocation.count({
          where: {
            inventoryItem: { inventoryId: inventory.id },
            status: SerializedAssetAllocationStatus.ACTIVE,
            rangeStartUtc: { lt: range.end },
            rangeEndExclusiveUtc: { gt: range.start },
          },
        });
        const available = Math.max(0, physical - overlapping);
        return {
          availableToReserve: available,
          eligibleSerializedAssetCount: available,
          inventoryId: inventory.id,
          orderedQuantity: item.quotedQuantity,
          overlappingReservedQuantity: overlapping,
          physicalRentableQuantity: physical,
          productId: item.productIdSnapshot,
          productName: item.productNameSnapshot,
          rentalOrderItemId: item.id,
          shortfallQuantity: Math.max(0, item.quotedQuantity - available),
          trackingMode: inventory.trackingMode,
        };
      }),
    );
    return {
      calculatedAt: new Date().toISOString(),
      items,
      notice: availabilityNotice,
      orderId: order.id,
      rentalEndDate: this.dateOnly(order.rentalEndDateSnapshot),
      rentalStartDate: this.dateOnly(order.rentalStartDateSnapshot),
      requestedTimeZone: order.requestedTimeZoneSnapshot,
    };
  }

  private async planAdditionalAllocations(
    tx: Prisma.TransactionClient,
    reservation: Pick<
      Prisma.InventoryReservationGetPayload<Record<string, never>>,
      'id' | 'rangeStartUtc' | 'rangeEndExclusiveUtc'
    >,
    items: Array<{
      id: string;
      inventoryId: string;
      rentalOrderItemId: string;
      requestedQuantity: number;
      reservationType: InventoryReservationItemType;
      consumedQuantity: number;
      reservedQuantity: number;
    }>,
    selections: Array<{
      rentalOrderItemId: string;
      serializedAssetIds: string[];
    }>,
  ) {
    const byOrderItem = new Map(
      selections.map((selection) => [
        selection.rentalOrderItemId,
        selection.serializedAssetIds,
      ]),
    );
    for (const itemId of byOrderItem.keys())
      if (!items.some((item) => item.rentalOrderItemId === itemId))
        throw new UnprocessableEntityException(
          'Asset selection does not belong to this order',
        );
    const allAssetIds = [
      ...new Set(
        selections.flatMap(({ serializedAssetIds }) => serializedAssetIds),
      ),
    ].sort();
    if (allAssetIds.length)
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" IN (${Prisma.join(allAssetIds)}) ORDER BY "id" FOR UPDATE`;
    return Promise.all(
      items.map(async (item) => {
        const remaining =
          item.requestedQuantity -
          item.consumedQuantity -
          item.reservedQuantity;
        if (remaining <= 0)
          return {
            ...item,
            assetIds: [] as string[],
            committedAfter: item.consumedQuantity + item.reservedQuantity,
            quantityDelta: 0,
            reservedAfter: item.reservedQuantity,
          };
        if (item.reservationType === InventoryReservationItemType.BULK) {
          const physical = await this.bulkRentable(tx, item.inventoryId);
          const overlapping = await this.overlappingBulk(
            tx,
            item.inventoryId,
            reservation.rangeStartUtc,
            reservation.rangeEndExclusiveUtc,
          );
          const quantityDelta = Math.min(
            remaining,
            Math.max(0, physical - overlapping),
          );
          return {
            ...item,
            assetIds: [] as string[],
            committedAfter:
              item.consumedQuantity + item.reservedQuantity + quantityDelta,
            quantityDelta,
            reservedAfter: item.reservedQuantity + quantityDelta,
          };
        }
        const assetIds = byOrderItem.get(item.rentalOrderItemId) ?? [];
        if (assetIds.length > remaining)
          throw new UnprocessableEntityException(
            'Selected assets exceed the order quantity',
          );
        const assets = await tx.inventoryItem.findMany({
          where: {
            id: { in: assetIds },
            inventoryId: item.inventoryId,
            status: InventoryState.RENTABLE,
            serializedAllocations: {
              none: {
                status: SerializedAssetAllocationStatus.ACTIVE,
                rangeStartUtc: { lt: reservation.rangeEndExclusiveUtc },
                rangeEndExclusiveUtc: { gt: reservation.rangeStartUtc },
              },
            },
          },
          select: { id: true },
        });
        if (assets.length !== assetIds.length)
          throw new ConflictException(
            'One or more selected assets are no longer eligible',
          );
        return {
          ...item,
          assetIds,
          committedAfter:
            item.consumedQuantity + item.reservedQuantity + assetIds.length,
          quantityDelta: assetIds.length,
          reservedAfter: item.reservedQuantity + assetIds.length,
        };
      }),
    );
  }

  private async applyPlan(
    tx: Prisma.TransactionClient,
    operationId: string,
    actorId: string,
    reservation: { rangeStartUtc: Date; rangeEndExclusiveUtc: Date },
    plan: Awaited<
      ReturnType<InventoryReservationService['planAdditionalAllocations']>
    >,
  ) {
    for (const item of plan) {
      await tx.inventoryReservationItem.update({
        where: { id: item.id },
        data: {
          reservedQuantity: item.reservedAfter,
          shortfallQuantity: Math.max(
            0,
            item.requestedQuantity - item.consumedQuantity - item.reservedAfter,
          ),
        },
      });
      if (item.quantityDelta > 0 && item.assetIds.length === 0)
        await tx.inventoryReservationOperationItem.create({
          data: {
            quantityDelta: item.quantityDelta,
            reservationItemId: item.id,
            reservationOperationId: operationId,
          },
        });
      for (const inventoryItemId of item.assetIds) {
        await tx.serializedAssetAllocation.create({
          data: {
            allocatedByUserId: actorId,
            allocatedOperationId: operationId,
            inventoryItemId,
            rangeEndExclusiveUtc: reservation.rangeEndExclusiveUtc,
            rangeStartUtc: reservation.rangeStartUtc,
            reservationItemId: item.id,
          },
        });
        await tx.inventoryReservationOperationItem.create({
          data: {
            inventoryItemId,
            quantityDelta: 1,
            reservationItemId: item.id,
            reservationOperationId: operationId,
          },
        });
      }
    }
  }

  private async assertPartialPolicy(
    tx: Prisma.TransactionClient,
    actorId: string,
    input: { allowPartial: boolean; overrideReason?: string },
    hasShortfall: boolean,
  ) {
    if (!hasShortfall) return;
    if (!input.allowPartial)
      throw new ConflictException(
        'Full reservation is not currently available',
      );
    if (!input.overrideReason)
      throw new UnprocessableEntityException(
        'A reason is required for an intentional partial reservation',
      );
    await this.requireActor(tx, actorId, ['inventory.reservation.override']);
  }

  private async requireEligibleOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const order = await tx.rentalOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        reservation: { include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('Rental order not found');
    if (order.status !== 'CONFIRMED')
      throw new ConflictException('Only confirmed orders can be reserved');
    if (
      await tx.rentalChangeRequest.findFirst({
        where: {
          rentalOrderId: order.id,
          status: {
            in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED_FOR_REQUOTE'],
          },
        },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'The order has an unresolved formal change request',
      );
    if (order.rentalEndDateSnapshot < order.rentalStartDateSnapshot)
      throw new UnprocessableEntityException(
        'Order rental end date cannot precede its start date',
      );
    this.orderRange(order);
    return order;
  }

  private async lockInventoriesForOrder(
    tx: Prisma.TransactionClient,
    order: EligibleOrder,
  ) {
    const productIds = [
      ...new Set(order.items.map(({ productIdSnapshot }) => productIdSnapshot)),
    ].sort();
    const inventories = await tx.inventory.findMany({
      where: { productId: { in: productIds } },
      orderBy: { id: 'asc' },
    });
    const ids = inventories.map(({ id }) => id).sort();
    if (ids.length)
      await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    return new Map(
      inventories.map((inventory) => [inventory.productId, inventory]),
    );
  }

  private async bulkRentable(
    tx: Prisma.TransactionClient,
    inventoryId: string,
  ) {
    const [incoming, outgoing] = await Promise.all([
      tx.inventoryTransaction.aggregate({
        where: { inventoryId, toState: InventoryState.RENTABLE },
        _sum: { quantity: true },
      }),
      tx.inventoryTransaction.aggregate({
        where: { inventoryId, fromState: InventoryState.RENTABLE },
        _sum: { quantity: true },
      }),
    ]);
    return (incoming._sum.quantity ?? 0) - (outgoing._sum.quantity ?? 0);
  }

  private async overlappingBulk(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    start: Date,
    end: Date,
  ) {
    const aggregate = await tx.inventoryReservationItem.aggregate({
      where: {
        inventoryId,
        reservationType: InventoryReservationItemType.BULK,
        inventoryReservation: {
          status: { in: activeReservationStatuses },
          rangeStartUtc: { lt: end },
          rangeEndExclusiveUtc: { gt: start },
        },
      },
      _sum: { reservedQuantity: true },
    });
    return aggregate._sum.reservedQuantity ?? 0;
  }

  private async replay(
    tx: Prisma.TransactionClient,
    operationId: string,
    payloadHash: string,
    actorId: string,
    orderId: string,
  ) {
    const existing = await tx.inventoryReservationOperation.findUnique({
      where: { operationId },
      include: { inventoryReservation: true },
    });
    if (!existing) return null;
    if (
      existing.payloadHash !== payloadHash ||
      existing.actorUserId !== actorId ||
      existing.inventoryReservation.rentalOrderId !== orderId
    )
      throw new ConflictException(
        'Operation identifier was reused differently',
      );
    return {
      failed:
        existing.type === InventoryReservationOperationType.RESERVATION_FAILED,
      id: existing.inventoryReservationId,
    };
  }

  private async getWithNoPermissionCheck(id: string) {
    const reservation = await prisma.inventoryReservation.findUnique({
      where: { id },
      include: reservationInclude,
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return this.mapReservation(reservation);
  }

  private mapReservation(
    reservation: ReservationRecord,
  ): AdminInventoryReservationResponse {
    const override = [...reservation.operations]
      .reverse()
      .find((operation) => operation.reason && operation.metadata);
    return {
      activities: reservation.operations.map((operation) => ({
        actor: operation.actor,
        createdAt: operation.createdAt.toISOString(),
        id: operation.id,
        metadata: operation.metadata as Record<string, unknown> | null,
        reason: operation.reason,
        type: operation.type,
      })),
      createdAt: reservation.createdAt.toISOString(),
      id: reservation.id,
      items: reservation.items.map((item) => ({
        allocations: item.serializedAllocations.map((allocation) => ({
          allocatedAt: allocation.allocatedAt.toISOString(),
          allocationId: allocation.id,
          assetNumber: allocation.inventoryItem.assetNumber,
          releasedAt: allocation.releasedAt?.toISOString() ?? null,
          serialNumber: allocation.inventoryItem.serialNumber,
          serializedAssetId: allocation.inventoryItemId,
          status: allocation.status,
        })),
        productId: item.productIdSnapshot,
        productName: item.rentalOrderItem.productNameSnapshot,
        rentalOrderItemId: item.rentalOrderItemId,
        requestedQuantity: item.requestedQuantity,
        reservedQuantity: item.reservedQuantity,
        shortfallQuantity: item.shortfallQuantity,
        trackingMode: item.reservationType,
      })),
      orderId: reservation.rentalOrderId,
      orderNumber: reservation.rentalOrder.orderNumber,
      overrideReason: override?.reason ?? null,
      rentalEndDate: this.dateOnly(reservation.rentalEndDateSnapshot),
      rentalStartDate: this.dateOnly(reservation.rentalStartDateSnapshot),
      reservationNumber: reservation.reservationNumber,
      status: reservation.status,
      updatedAt: reservation.updatedAt.toISOString(),
      version: reservation.version,
    };
  }

  private orderStatus(
    status: InventoryReservationStatus,
  ): RentalOrderReservationStatus {
    if (status === InventoryReservationStatus.PARTIALLY_RESERVED)
      return RentalOrderReservationStatus.PARTIALLY_RESERVED;
    if (status === InventoryReservationStatus.RESERVED)
      return RentalOrderReservationStatus.RESERVED;
    if (status === InventoryReservationStatus.RELEASED)
      return RentalOrderReservationStatus.RELEASED;
    if (status === InventoryReservationStatus.PARTIALLY_CONSUMED)
      return RentalOrderReservationStatus.PARTIALLY_CONSUMED;
    if (status === InventoryReservationStatus.CONSUMED)
      return RentalOrderReservationStatus.CONSUMED;
    if (status === InventoryReservationStatus.RESERVATION_FAILED)
      return RentalOrderReservationStatus.RESERVATION_FAILED;
    return RentalOrderReservationStatus.NOT_RESERVED;
  }

  private async requireActor(
    tx: Prisma.TransactionClient,
    actorId: string,
    required: string[],
  ) {
    const actor = await tx.user.findFirst({
      where: { id: actorId, status: UserStatus.ACTIVE },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    const keys = new Set(
      actor?.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key),
      ) ?? [],
    );
    if (!actor || required.some((permission) => !keys.has(permission)))
      throw new ForbiddenException('Insufficient permissions');
  }

  private async lockOrder(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "RentalOrder" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Rental order not found');
  }

  private async lockReservation(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "InventoryReservation" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Reservation not found');
  }

  private async mutate<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const databaseCode = this.postgresCode(error);
        if (
          (['P2002', 'P2034'].includes(this.prismaCode(error) ?? '') ||
            databaseCode === '40001') &&
          attempt < 2
        )
          continue;
        if (
          ['P2002', 'P2034'].includes(this.prismaCode(error) ?? '') ||
          ['23P01', '40001'].includes(databaseCode ?? '')
        )
          throw new ConflictException(
            'Reservation state changed. Refresh and try again.',
          );
        throw error;
      }
    }
    throw new ConflictException(
      'Reservation state changed. Refresh and try again.',
    );
  }

  private prismaCode(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }

  private postgresCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    if ('code' in error && ['23P01', '40001'].includes(String(error.code)))
      return String(error.code);
    if ('meta' in error) {
      const meta = error.meta;
      if (typeof meta === 'object' && meta !== null && 'code' in meta)
        return String(meta.code);
    }
    return undefined;
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  private reservationNumber() {
    return `IR-${randomBytes(10).toString('hex').toUpperCase()}`;
  }

  private orderRange(order: {
    rentalEndDateSnapshot: Date;
    rentalStartDateSnapshot: Date;
    requestedTimeZoneSnapshot: string;
  }) {
    const startDate = this.dateOnly(order.rentalStartDateSnapshot);
    const inclusiveEndDate = this.dateOnly(order.rentalEndDateSnapshot);
    const exclusiveEndDate = this.addCalendarDays(inclusiveEndDate, 1);
    return {
      end: this.localMidnightUtc(
        exclusiveEndDate,
        order.requestedTimeZoneSnapshot,
      ),
      start: this.localMidnightUtc(startDate, order.requestedTimeZoneSnapshot),
    };
  }

  private addCalendarDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return this.dateOnly(value);
  }

  private localMidnightUtc(date: string, timeZone: string) {
    const [year, month, day] = date.split('-').map(Number) as [
      number,
      number,
      number,
    ];
    let candidate = Date.UTC(year, month - 1, day);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone,
      year: 'numeric',
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(candidate))
          .filter(({ type }) => type !== 'literal')
          .map(({ type, value }) => [type, Number(value)]),
      );
      const hour = parts.hour === 24 ? 0 : parts.hour!;
      const displayedAsUtc = Date.UTC(
        parts.year!,
        parts.month! - 1,
        parts.day!,
        hour,
        parts.minute!,
        parts.second!,
      );
      const offset = displayedAsUtc - candidate;
      const corrected = Date.UTC(year, month - 1, day) - offset;
      if (corrected === candidate) break;
      candidate = corrected;
    }
    const result = new Date(candidate);
    const local = formatter.formatToParts(result);
    const values = Object.fromEntries(
      local
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]),
    );
    if (
      values.year !== year ||
      values.month !== month ||
      values.day !== day ||
      ![0, 24].includes(values.hour!) ||
      values.minute !== 0 ||
      values.second !== 0
    )
      throw new UnprocessableEntityException(
        'Order timezone cannot resolve the rental date range',
      );
    return result;
  }
}

type EligibleOrder = Awaited<
  ReturnType<InventoryReservationService['requireEligibleOrder']>
>;
