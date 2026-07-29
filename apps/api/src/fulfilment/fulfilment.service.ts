import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ActiveRentalStatus,
  FulfilmentHandoffType,
  FulfilmentOperationType,
  InventoryReservationItemType,
  InventoryReservationStatus,
  InventoryState,
  InventoryTransactionKind,
  OrderFulfilmentStatus,
  Prisma,
  RentalOrderReservationStatus,
  SerializedAssetAllocationStatus,
  UserStatus,
  prisma,
} from '@mensah-rentals/database';
import type {
  AdminActiveRentalDetailResponse,
  AdminActiveRentalListResponse,
  AdminFulfilmentResponse,
} from '@mensah-rentals/types';
import type {
  ActiveRentalListQuery,
  CheckoutFulfilmentInput,
  MarkFulfilmentReadyInput,
  StartPreparationInput,
  UpdatePreparationInput,
} from '@mensah-rentals/validation';

import {
  buildSelectableTextPdf,
  safePdfFilename,
} from '../common/selectable-text-pdf';

const internalNotice =
  'Internal fulfilment data. Do not disclose reserved, prepared, shortfall, or serialized asset information to customers.';
const fulfilmentInclude = {
  activeRental: { select: { expectedReturnAt: true, id: true, status: true } },
  inventoryReservation: { select: { version: true } },
  items: {
    include: {
      preparedSerializedAssets: true,
      rentalOrderItem: { select: { productNameSnapshot: true } },
      reservationItem: {
        include: {
          inventory: { select: { trackingMode: true } },
          serializedAllocations: {
            where: {
              status: {
                in: [
                  SerializedAssetAllocationStatus.ACTIVE,
                  SerializedAssetAllocationStatus.CONSUMED,
                ],
              },
            },
            include: {
              inventoryItem: {
                select: { assetNumber: true, serialNumber: true },
              },
            },
            orderBy: { allocatedAt: 'asc' as const },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  operations: {
    include: {
      actor: { select: { firstName: true, id: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  rentalOrder: { select: { orderNumber: true } },
} satisfies Prisma.OrderFulfilmentInclude;
type FulfilmentRecord = Prisma.OrderFulfilmentGetPayload<{
  include: typeof fulfilmentInclude;
}>;
type ActiveRentalSummaryRecord = Prisma.ActiveRentalGetPayload<{
  include: { items: true; rentalOrder: true };
}>;

@Injectable()
export class FulfilmentService {
  async get(
    actorId: string,
    orderId: string,
  ): Promise<AdminFulfilmentResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['fulfilment.view']);
      const record = await tx.orderFulfilment.findUnique({
        where: { rentalOrderId: orderId },
        include: fulfilmentInclude,
      });
      if (!record) throw new NotFoundException('Fulfilment has not started');
      return this.map(record);
    });
  }

  async start(actorId: string, orderId: string, input: StartPreparationInput) {
    const payloadHash = this.hash({ action: 'start', orderId, ...input });
    const id = await this.mutate(async (tx) => {
      await this.lockOrder(tx, orderId);
      await this.requireActor(tx, actorId, ['fulfilment.prepare']);
      const replay = await this.replay(
        tx,
        input.operationId,
        payloadHash,
        actorId,
        orderId,
      );
      if (replay) return replay;
      const order = await this.eligibleOrder(tx, orderId);
      if (order.fulfilment)
        throw new ConflictException('Preparation already started');
      const reservation = order.reservation;
      if (
        !reservation ||
        !this.reservationOperational(reservation.status) ||
        !reservation.items.some((item) => item.reservedQuantity > 0)
      )
        throw new UnprocessableEntityException(
          'An active reservation is required before preparation',
        );
      if (reservation.version !== input.expectedReservationVersion)
        throw new ConflictException(
          'Reservation changed. Refresh and try again.',
        );
      const fulfilment = await tx.orderFulfilment.create({
        data: {
          createdByUserId: actorId,
          fulfilmentMethod: order.fulfillmentMethodSnapshot,
          inventoryReservationId: reservation.id,
          rentalOrderId: order.id,
          updatedByUserId: actorId,
        },
      });
      for (const reservationItem of reservation.items) {
        await tx.orderFulfilmentItem.create({
          data: {
            orderFulfilmentId: fulfilment.id,
            orderedQuantitySnapshot:
              reservationItem.rentalOrderItem.quotedQuantity,
            rentalOrderItemId: reservationItem.rentalOrderItemId,
            reservationItemId: reservationItem.id,
          },
        });
      }
      await tx.fulfilmentOperation.create({
        data: {
          actorUserId: actorId,
          expectedVersion: 0,
          operationId: input.operationId,
          orderFulfilmentId: fulfilment.id,
          payloadHash,
          resultingVersion: 1,
          type: FulfilmentOperationType.PREPARATION_STARTED,
        },
      });
      await tx.orderFulfilment.update({
        where: { id: fulfilment.id },
        data: { version: 1 },
      });
      return fulfilment.id;
    });
    return this.getById(id);
  }

  async prepare(
    actorId: string,
    orderId: string,
    input: UpdatePreparationInput,
  ) {
    const payloadHash = this.hash({ action: 'prepare', orderId, ...input });
    const id = await this.mutate(async (tx) => {
      await this.lockOrder(tx, orderId);
      await this.requireActor(tx, actorId, ['fulfilment.prepare']);
      const replay = await this.replay(
        tx,
        input.operationId,
        payloadHash,
        actorId,
        orderId,
      );
      if (replay) return replay;
      const order = await this.eligibleOrder(tx, orderId);
      const fulfilment = order.fulfilment;
      if (!fulfilment) throw new ConflictException('Start preparation first');
      await this.lockFulfilment(tx, fulfilment.id);
      if (fulfilment.version !== input.expectedVersion)
        throw new ConflictException(
          'Fulfilment changed. Refresh and try again.',
        );
      if (fulfilment.status === OrderFulfilmentStatus.CHECKED_OUT)
        throw new ConflictException('Fulfilment is already checked out');
      const byOrderItem = new Map(
        fulfilment.items.map((item) => [item.rentalOrderItemId, item]),
      );
      const operation = await tx.fulfilmentOperation.create({
        data: {
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          internalReason: input.internalNote,
          operationId: input.operationId,
          orderFulfilmentId: fulfilment.id,
          payloadHash,
          resultingVersion: input.expectedVersion + 1,
          type: FulfilmentOperationType.PREPARATION_UPDATED,
        },
      });
      for (const target of input.items) {
        const item = byOrderItem.get(target.rentalOrderItemId);
        if (!item)
          throw new UnprocessableEntityException(
            'Preparation item does not belong to this order',
          );
        if (target.quantity > item.reservationItem.reservedQuantity)
          throw new UnprocessableEntityException(
            'Prepared quantity cannot exceed active reserved quantity',
          );
        if (
          item.reservationItem.reservationType ===
          InventoryReservationItemType.SERIALIZED
        ) {
          if (target.serializedAllocationIds.length !== target.quantity)
            throw new UnprocessableEntityException(
              'Prepared serialized quantity must match selected assets',
            );
          const eligible = new Set(
            item.reservationItem.serializedAllocations
              .filter(
                (a) => a.status === SerializedAssetAllocationStatus.ACTIVE,
              )
              .map((a) => a.id),
          );
          if (
            target.serializedAllocationIds.some(
              (allocationId) => !eligible.has(allocationId),
            )
          )
            throw new UnprocessableEntityException(
              'A selected asset is not actively reserved for this item',
            );
        } else if (target.serializedAllocationIds.length)
          throw new UnprocessableEntityException(
            'Bulk items cannot select serialized assets',
          );
        const delta = target.quantity - item.preparedQuantity;
        if (
          item.reservationItem.reservationType ===
          InventoryReservationItemType.SERIALIZED
        ) {
          const previous = new Set(
            item.preparedSerializedAssets.map(
              (prepared) => prepared.serializedAllocationId,
            ),
          );
          const next = new Set(target.serializedAllocationIds);
          const changes = [
            ...[...previous]
              .filter((allocationId) => !next.has(allocationId))
              .map((serializedAllocationId) => ({
                preparedDelta: -1,
                serializedAllocationId,
              })),
            ...[...next]
              .filter((allocationId) => !previous.has(allocationId))
              .map((serializedAllocationId) => ({
                preparedDelta: 1,
                serializedAllocationId,
              })),
          ];
          if (changes.length)
            await tx.fulfilmentOperationItem.createMany({
              data: changes.map((change) => ({
                ...change,
                fulfilmentOperationId: operation.id,
                orderFulfilmentItemId: item.id,
              })),
            });
          await tx.preparedSerializedAsset.deleteMany({
            where: { orderFulfilmentItemId: item.id },
          });
          if (target.serializedAllocationIds.length)
            await tx.preparedSerializedAsset.createMany({
              data: target.serializedAllocationIds.map(
                (serializedAllocationId) => ({
                  orderFulfilmentItemId: item.id,
                  serializedAllocationId,
                }),
              ),
            });
        } else if (delta !== 0)
          await tx.fulfilmentOperationItem.create({
            data: {
              fulfilmentOperationId: operation.id,
              orderFulfilmentItemId: item.id,
              preparedDelta: delta,
            },
          });
        await tx.orderFulfilmentItem.update({
          where: { id: item.id },
          data: { preparedQuantity: target.quantity },
        });
      }
      await tx.orderFulfilment.update({
        where: { id: fulfilment.id },
        data: {
          status: OrderFulfilmentStatus.PREPARING,
          readyAt: null,
          updatedByUserId: actorId,
          version: { increment: 1 },
        },
      });
      return fulfilment.id;
    });
    return this.getById(id);
  }

  async markReady(
    actorId: string,
    orderId: string,
    input: MarkFulfilmentReadyInput,
  ) {
    const payloadHash = this.hash({ action: 'ready', orderId, ...input });
    const id = await this.mutate(async (tx) => {
      await this.lockOrder(tx, orderId);
      await this.requireActor(tx, actorId, ['fulfilment.prepare']);
      const replay = await this.replay(
        tx,
        input.operationId,
        payloadHash,
        actorId,
        orderId,
      );
      if (replay) return replay;
      const order = await this.eligibleOrder(tx, orderId);
      const fulfilment = order.fulfilment;
      if (!fulfilment) throw new ConflictException('Start preparation first');
      await this.lockFulfilment(tx, fulfilment.id);
      if (fulfilment.version !== input.expectedVersion)
        throw new ConflictException(
          'Fulfilment changed. Refresh and try again.',
        );
      if (
        !fulfilment.items.some(
          (item) => item.reservationItem.reservedQuantity > 0,
        ) ||
        fulfilment.items.some(
          (item) =>
            item.preparedQuantity !== item.reservationItem.reservedQuantity,
        )
      )
        throw new UnprocessableEntityException(
          'Every actively reserved item must be prepared before readiness',
        );
      await tx.fulfilmentOperation.create({
        data: {
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          operationId: input.operationId,
          orderFulfilmentId: fulfilment.id,
          payloadHash,
          resultingVersion: input.expectedVersion + 1,
          type: FulfilmentOperationType.MARKED_READY,
        },
      });
      await tx.orderFulfilment.update({
        where: { id: fulfilment.id },
        data: {
          readyAt: new Date(),
          status: OrderFulfilmentStatus.READY,
          updatedByUserId: actorId,
          version: { increment: 1 },
        },
      });
      return fulfilment.id;
    });
    return this.getById(id);
  }

  async checkout(
    actorId: string,
    orderId: string,
    input: CheckoutFulfilmentInput,
  ) {
    const payloadHash = this.hash({ action: 'checkout', orderId, ...input });
    const id = await this.mutate(async (tx) => {
      await this.lockOrder(tx, orderId);
      await this.requireActor(tx, actorId, [
        'fulfilment.checkout',
        'fulfilment.handoff',
      ]);
      const replay = await this.replay(
        tx,
        input.operationId,
        payloadHash,
        actorId,
        orderId,
      );
      if (replay) return replay;
      const order = await this.eligibleOrder(tx, orderId);
      const reservation = order.reservation;
      const fulfilment = order.fulfilment;
      if (!reservation || !fulfilment)
        throw new UnprocessableEntityException(
          'Preparation and an active reservation are required',
        );
      await this.lockReservation(tx, reservation.id);
      await this.lockFulfilment(tx, fulfilment.id);
      if (
        fulfilment.version !== input.expectedVersion ||
        reservation.version !== input.expectedReservationVersion
      )
        throw new ConflictException(
          'Fulfilment or reservation changed. Refresh and try again.',
        );
      if (
        fulfilment.status !== OrderFulfilmentStatus.READY &&
        fulfilment.status !== OrderFulfilmentStatus.PARTIALLY_CHECKED_OUT
      )
        throw new ConflictException('Fulfilment must be ready before checkout');
      const targets = new Map(
        input.items.map((item) => [item.rentalOrderItemId, item]),
      );
      const after = fulfilment.items.map((item) => ({
        item,
        target: targets.get(item.rentalOrderItemId),
        total:
          item.checkedOutQuantity +
          (targets.get(item.rentalOrderItemId)?.quantity ?? 0),
      }));
      if (
        targets.size !== input.items.length ||
        input.items.some((item) => item.quantity <= 0)
      )
        throw new UnprocessableEntityException(
          'Checkout quantities must be positive and unique',
        );
      if (
        input.items.some(
          (target) =>
            !fulfilment.items.some(
              (item) => item.rentalOrderItemId === target.rentalOrderItemId,
            ),
        )
      )
        throw new UnprocessableEntityException(
          'Checkout item does not belong to this order',
        );
      const complete = after.every(
        ({ item, total }) => total === item.orderedQuantitySnapshot,
      );
      if (!complete && !input.allowPartial)
        throw new UnprocessableEntityException(
          'This checkout is partial and requires explicit confirmation',
        );
      if (complete && input.allowPartial)
        throw new UnprocessableEntityException(
          'Partial checkout confirmation is not valid for a complete checkout',
        );
      if (!complete)
        await this.requireActor(tx, actorId, ['fulfilment.partial_checkout']);
      if (order.fulfillmentMethodSnapshot === 'PICKUP' && !input.recipientName)
        throw new UnprocessableEntityException(
          'Pickup checkout requires a recipient name',
        );
      const handoffAt = new Date(input.handoffAt);
      const operation = await tx.fulfilmentOperation.create({
        data: {
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          internalReason: input.internalReason,
          operationId: input.operationId,
          orderFulfilmentId: fulfilment.id,
          payloadHash,
          resultingVersion: input.expectedVersion + 1,
          type: FulfilmentOperationType.CHECKOUT,
        },
      });
      let activeRental = await tx.activeRental.findUnique({
        where: { rentalOrderId: order.id },
      });
      if (!activeRental)
        activeRental = await tx.activeRental.create({
          data: {
            activatedByUserId: actorId,
            checkedOutAt: handoffAt,
            expectedReturnAt: reservation.rangeEndExclusiveUtc,
            orderFulfilmentId: fulfilment.id,
            rentalOrderId: order.id,
            rentalStartAt: reservation.rangeStartUtc,
            status: complete
              ? ActiveRentalStatus.ACTIVE
              : ActiveRentalStatus.PARTIALLY_ACTIVE,
          },
        });
      for (const { item, target } of after) {
        if (!target) continue;
        if (
          target.quantity > item.preparedQuantity ||
          target.quantity > item.reservationItem.reservedQuantity
        )
          throw new UnprocessableEntityException(
            'Checkout cannot exceed prepared and actively reserved quantity',
          );
        const inventoryId = item.reservationItem.inventoryId;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${inventoryId}, 0))`;
        await tx.inventoryReservationItem.update({
          where: { id: item.reservationItemId },
          data: {
            consumedQuantity: { increment: target.quantity },
            reservedQuantity: { decrement: target.quantity },
          },
        });
        await tx.orderFulfilmentItem.update({
          where: { id: item.id },
          data: {
            checkedOutQuantity: { increment: target.quantity },
            preparedQuantity: { decrement: target.quantity },
          },
        });
        await tx.fulfilmentOperationItem.create({
          data: {
            checkedOutDelta: target.quantity,
            fulfilmentOperationId: operation.id,
            orderFulfilmentItemId: item.id,
            preparedDelta: -target.quantity,
          },
        });
        const rentalItem = await tx.activeRentalItem.upsert({
          where: { rentalOrderItemId: item.rentalOrderItemId },
          create: {
            activeRentalId: activeRental.id,
            checkedOutQuantity: target.quantity,
            orderFulfilmentItemId: item.id,
            rentalOrderItemId: item.rentalOrderItemId,
          },
          update: { checkedOutQuantity: { increment: target.quantity } },
        });
        if (
          item.reservationItem.reservationType ===
          InventoryReservationItemType.BULK
        ) {
          if (target.serializedAllocationIds.length)
            throw new UnprocessableEntityException(
              'Bulk checkout cannot select serialized assets',
            );
          await tx.inventoryTransaction.create({
            data: {
              actorUserId: actorId,
              fromState: InventoryState.RENTABLE,
              fulfilmentOperationId: operation.id,
              inventoryId,
              kind: InventoryTransactionKind.BULK_MOVEMENT,
              operationId: this.derivedUuid(input.operationId, item.id),
              quantity: target.quantity,
              reason: 'Fulfilment checkout',
              toState: InventoryState.RENTED,
            },
          });
        } else {
          if (target.serializedAllocationIds.length !== target.quantity)
            throw new UnprocessableEntityException(
              'Serialized checkout quantity must match selected allocations',
            );
          const preparedAllocationIds = new Set(
            item.preparedSerializedAssets.map(
              (prepared) => prepared.serializedAllocationId,
            ),
          );
          if (
            target.serializedAllocationIds.some(
              (allocationId) => !preparedAllocationIds.has(allocationId),
            )
          )
            throw new UnprocessableEntityException(
              'Serialized checkout must use the assets selected during preparation',
            );
          for (const allocationId of target.serializedAllocationIds) {
            const allocation = item.reservationItem.serializedAllocations.find(
              (entry) => entry.id === allocationId,
            );
            if (
              !allocation ||
              allocation.status !== SerializedAssetAllocationStatus.ACTIVE
            )
              throw new UnprocessableEntityException(
                'Serialized asset is not actively reserved for this item',
              );
            const inventoryItem = await tx.inventoryItem.findUnique({
              where: { id: allocation.inventoryItemId },
            });
            if (
              !inventoryItem ||
              inventoryItem.inventoryId !== inventoryId ||
              inventoryItem.status !== InventoryState.RENTABLE
            )
              throw new UnprocessableEntityException(
                'Serialized asset is not eligible for checkout',
              );
            await tx.inventoryTransaction.create({
              data: {
                actorUserId: actorId,
                fromState: InventoryState.RENTABLE,
                fulfilmentOperationId: operation.id,
                inventoryId,
                inventoryItemId: inventoryItem.id,
                kind: InventoryTransactionKind.SERIALIZED_ITEM_STATE_CHANGED,
                operationId: this.derivedUuid(input.operationId, allocation.id),
                quantity: 1,
                reason: 'Fulfilment checkout',
                toState: InventoryState.RENTED,
              },
            });
            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: { status: InventoryState.RENTED },
            });
            await tx.serializedAssetAllocation.update({
              where: { id: allocation.id },
              data: {
                consumedAt: handoffAt,
                consumedFulfilmentOperationId: operation.id,
                status: SerializedAssetAllocationStatus.CONSUMED,
              },
            });
            await tx.activeRentalSerializedAsset.create({
              data: {
                activeRentalItemId: rentalItem.id,
                checkedOutAt: handoffAt,
                inventoryItemId: inventoryItem.id,
                serializedAllocationId: allocation.id,
              },
            });
          }
          await tx.preparedSerializedAsset.deleteMany({
            where: {
              serializedAllocationId: {
                in: target.serializedAllocationIds,
              },
            },
          });
        }
      }
      const remainingReserved = reservation.items.reduce(
        (sum, item) =>
          sum +
          item.reservedQuantity -
          (targets.get(item.rentalOrderItemId)?.quantity ?? 0),
        0,
      );
      const reservationStatus =
        remainingReserved > 0
          ? InventoryReservationStatus.PARTIALLY_CONSUMED
          : InventoryReservationStatus.CONSUMED;
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: reservationStatus, version: { increment: 1 } },
      });
      await tx.rentalOrder.update({
        where: { id: order.id },
        data: {
          reservationStatus:
            remainingReserved > 0
              ? RentalOrderReservationStatus.PARTIALLY_CONSUMED
              : RentalOrderReservationStatus.CONSUMED,
          reservationVersion: { increment: 1 },
        },
      });
      await tx.activeRental.update({
        where: { id: activeRental.id },
        data: {
          status: complete
            ? ActiveRentalStatus.ACTIVE
            : ActiveRentalStatus.PARTIALLY_ACTIVE,
          version: { increment: 1 },
        },
      });
      await tx.fulfilmentHandoff.create({
        data: {
          acknowledgementReference: input.acknowledgementReference,
          activeRentalId: activeRental.id,
          actorUserId: actorId,
          destinationSnapshot:
            order.fulfillmentMethodSnapshot === 'PICKUP'
              ? null
              : order.deliveryAddressSnapshot,
          fulfilmentOperationId: operation.id,
          handoffAt,
          internalNotes: input.internalNotes,
          recipientName: input.recipientName,
          type:
            order.fulfillmentMethodSnapshot === 'PICKUP'
              ? FulfilmentHandoffType.PICKUP
              : FulfilmentHandoffType.DELIVERY,
        },
      });
      await tx.orderFulfilment.update({
        where: { id: fulfilment.id },
        data: {
          firstCheckedOutAt: fulfilment.firstCheckedOutAt ?? handoffAt,
          fullyCheckedOutAt: complete ? handoffAt : null,
          status: complete
            ? OrderFulfilmentStatus.CHECKED_OUT
            : OrderFulfilmentStatus.PARTIALLY_CHECKED_OUT,
          updatedByUserId: actorId,
          version: { increment: 1 },
        },
      });
      return fulfilment.id;
    });
    return this.getById(id);
  }

  async listActive(
    actorId: string,
    query: ActiveRentalListQuery,
  ): Promise<AdminActiveRentalListResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['active_rental.view']);
      const now = new Date();
      const where: Prisma.ActiveRentalWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.overdue === true ? { expectedReturnAt: { lt: now } } : {}),
        ...(query.overdue === false ? { expectedReturnAt: { gte: now } } : {}),
        ...(query.fulfillmentMethod
          ? {
              rentalOrder: {
                fulfillmentMethodSnapshot: query.fulfillmentMethod,
              },
            }
          : {}),
        ...(query.search
          ? {
              rentalOrder: {
                OR: [
                  {
                    orderNumber: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    contactFirstNameSnapshot: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    contactLastNameSnapshot: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    projectNameSnapshot: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        tx.activeRental.count({ where }),
        tx.activeRental.findMany({
          where,
          include: { items: true, rentalOrder: true },
          orderBy: [{ expectedReturnAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return {
        items: rows.map((row) => this.mapActiveSummary(row, now)),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        },
      };
    });
  }

  async activeDetail(
    actorId: string,
    id: string,
  ): Promise<AdminActiveRentalDetailResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['active_rental.view']);
      const row = await tx.activeRental.findUnique({
        where: { id },
        include: {
          rentalOrder: true,
          items: {
            include: {
              rentalOrderItem: true,
              serializedAssets: { include: { inventoryItem: true } },
            },
          },
          handoffs: {
            include: {
              actor: { select: { firstName: true, id: true, lastName: true } },
            },
            orderBy: { handoffAt: 'asc' },
          },
        },
      });
      if (!row) throw new NotFoundException('Active rental not found');
      return {
        ...this.mapActiveSummary(row, new Date()),
        expectedReturnDate: row.rentalOrder.rentalEndDateSnapshot
          .toISOString()
          .slice(0, 10),
        handoffs: row.handoffs.map((h) => ({
          acknowledgementReference: h.acknowledgementReference,
          actor: h.actor,
          destination: h.destinationSnapshot,
          handoffAt: h.handoffAt.toISOString(),
          id: h.id,
          internalNotes: h.internalNotes,
          recipientName: h.recipientName,
          type: h.type,
        })),
        items: row.items.map((item) => ({
          checkedOutQuantity: item.checkedOutQuantity,
          productName: item.rentalOrderItem.productNameSnapshot,
          rentalUnit: item.rentalOrderItem.rentalUnitSnapshot,
          serializedAssets: item.serializedAssets.map((asset) => ({
            assetNumber: asset.inventoryItem.assetNumber,
            serialNumber: asset.inventoryItem.serialNumber,
          })),
        })),
        notice: internalNotice,
      };
    });
  }

  async pdf(
    actorId: string,
    orderId: string,
    kind: 'picking' | 'handoff' | 'active-rental',
  ) {
    await prisma.$transaction((tx) =>
      this.requireActor(tx, actorId, ['fulfilment.view', 'fulfilment.pdf']),
    );
    const fulfilment = await this.getByOrder(orderId);
    const lines = [
      `Order: ${fulfilment.rentalOrder.orderNumber}`,
      `Status: ${fulfilment.status}`,
      `Method: ${fulfilment.fulfilmentMethod}`,
      '',
      ...fulfilment.items.flatMap((item) => [
        `${item.rentalOrderItem.productNameSnapshot}: ordered ${item.orderedQuantitySnapshot}, reserved ${item.reservationItem.reservedQuantity}, prepared ${item.preparedQuantity}, checked out ${item.checkedOutQuantity}`,
        ...item.reservationItem.serializedAllocations.map(
          (a) =>
            `Asset ${a.inventoryItem.assetNumber}${a.inventoryItem.serialNumber ? ` / ${a.inventoryItem.serialNumber}` : ''}: ${a.status}`,
        ),
      ]),
    ];
    const buffer = buildSelectableTextPdf({
      title: `Mensah Rentals ${kind.replace('-', ' ')}`,
      lines,
    });
    return {
      buffer,
      filename: safePdfFilename(fulfilment.rentalOrder.orderNumber, kind),
    };
  }

  private mapActiveSummary(row: ActiveRentalSummaryRecord, now: Date) {
    return {
      checkedOutAt: row.checkedOutAt.toISOString(),
      customerName: `${row.rentalOrder.contactFirstNameSnapshot} ${row.rentalOrder.contactLastNameSnapshot}`,
      expectedReturnAt: row.expectedReturnAt.toISOString(),
      fulfilmentMethod: row.rentalOrder.fulfillmentMethodSnapshot,
      id: row.id,
      itemCount: row.items.length,
      orderId: row.rentalOrderId,
      orderNumber: row.rentalOrder.orderNumber,
      overdue: now >= row.expectedReturnAt,
      projectName: row.rentalOrder.projectNameSnapshot,
      rentalStartAt: row.rentalStartAt.toISOString(),
      status: row.status,
    };
  }
  private map(record: FulfilmentRecord): AdminFulfilmentResponse {
    return {
      activities: record.operations.map((o) => ({
        actor: o.actor,
        createdAt: o.createdAt.toISOString(),
        id: o.id,
        internalReason: o.internalReason,
        type: o.type,
      })),
      activeRental: record.activeRental
        ? {
            expectedReturnAt:
              record.activeRental.expectedReturnAt.toISOString(),
            id: record.activeRental.id,
            status: record.activeRental.status,
          }
        : null,
      firstCheckedOutAt: record.firstCheckedOutAt?.toISOString() ?? null,
      fulfilmentMethod: record.fulfilmentMethod,
      fullyCheckedOutAt: record.fullyCheckedOutAt?.toISOString() ?? null,
      id: record.id,
      items: record.items.map((item) => ({
        checkedOutQuantity: item.checkedOutQuantity,
        consumedQuantity: item.reservationItem.consumedQuantity,
        id: item.id,
        orderedQuantity: item.orderedQuantitySnapshot,
        preparedQuantity: item.preparedQuantity,
        productName: item.rentalOrderItem.productNameSnapshot,
        remainingCommercialQuantity:
          item.orderedQuantitySnapshot - item.checkedOutQuantity,
        rentalOrderItemId: item.rentalOrderItemId,
        reservedQuantity: item.reservationItem.reservedQuantity,
        serializedAllocations: item.reservationItem.serializedAllocations.map(
          (a) => ({
            allocationId: a.id,
            assetNumber: a.inventoryItem.assetNumber,
            prepared: item.preparedSerializedAssets.some(
              (prepared) => prepared.serializedAllocationId === a.id,
            ),
            serialNumber: a.inventoryItem.serialNumber,
            status: a.status as 'ACTIVE' | 'CONSUMED',
          }),
        ),
        shortfallQuantity: item.reservationItem.shortfallQuantity,
        trackingMode: item.reservationItem.inventory.trackingMode,
      })),
      notice: internalNotice,
      orderId: record.rentalOrderId,
      orderNumber: record.rentalOrder.orderNumber,
      preparationStartedAt: record.preparationStartedAt.toISOString(),
      readyAt: record.readyAt?.toISOString() ?? null,
      reservationVersion: record.inventoryReservation.version,
      status: record.status,
      version: record.version,
    };
  }
  private async getById(id: string) {
    const record = await prisma.orderFulfilment.findUnique({
      where: { id },
      include: fulfilmentInclude,
    });
    if (!record) throw new NotFoundException('Fulfilment not found');
    return this.map(record);
  }
  private async getByOrder(orderId: string) {
    const record = await prisma.orderFulfilment.findUnique({
      where: { rentalOrderId: orderId },
      include: fulfilmentInclude,
    });
    if (!record) throw new NotFoundException('Fulfilment not found');
    return record;
  }
  private async eligibleOrder(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.rentalOrder.findUnique({
      where: { id: orderId },
      include: {
        fulfilment: {
          include: {
            items: {
              include: {
                preparedSerializedAssets: true,
                reservationItem: {
                  include: {
                    serializedAllocations: { include: { inventoryItem: true } },
                  },
                },
              },
            },
          },
        },
        reservation: {
          include: { items: { include: { rentalOrderItem: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Rental order not found');
    if (order.status !== 'CONFIRMED')
      throw new ConflictException('Only confirmed orders can enter fulfilment');
    if (order.rentalEndDateSnapshot < order.rentalStartDateSnapshot)
      throw new UnprocessableEntityException('Order dates are invalid');
    if (
      await tx.rentalChangeRequest.findFirst({
        where: {
          rentalOrderId: order.id,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED_FOR_REQUOTE'] },
        },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'The order has an unresolved formal change request',
      );
    return order;
  }
  private reservationOperational(status: InventoryReservationStatus) {
    return (
      status === InventoryReservationStatus.PARTIALLY_RESERVED ||
      status === InventoryReservationStatus.RESERVED ||
      status === InventoryReservationStatus.PARTIALLY_CONSUMED
    );
  }
  private async replay(
    tx: Prisma.TransactionClient,
    operationId: string,
    payloadHash: string,
    actorId: string,
    orderId: string,
  ) {
    const existing = await tx.fulfilmentOperation.findUnique({
      where: { operationId },
      include: { orderFulfilment: true },
    });
    if (!existing) return null;
    if (
      existing.payloadHash !== payloadHash ||
      existing.actorUserId !== actorId ||
      existing.orderFulfilment.rentalOrderId !== orderId
    )
      throw new ConflictException(
        'Operation ID was already used for a different request',
      );
    return existing.orderFulfilmentId;
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
    await tx.$queryRaw`SELECT "id" FROM "InventoryReservation" WHERE "id"=${id} FOR UPDATE`;
  }
  private async lockFulfilment(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "OrderFulfilment" WHERE "id"=${id} FOR UPDATE`;
  }
  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  private derivedUuid(operationId: string, discriminator: string) {
    const hex = createHash('sha256')
      .update(`${operationId}:${discriminator}`)
      .digest('hex')
      .slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
  }
  private async mutate<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code = this.prismaCode(error);
        const databaseCode = this.postgresCode(error);
        if (
          (['P2002', 'P2034'].includes(code ?? '') ||
            ['40001', '40P01', '23P01'].includes(databaseCode ?? '')) &&
          attempt < 2
        )
          continue;
        if (
          ['P2002', 'P2034'].includes(code ?? '') ||
          ['40001', '40P01', '23P01'].includes(databaseCode ?? '')
        )
          throw new ConflictException(
            'Fulfilment state changed. Refresh and try again.',
          );
        throw error;
      }
    }
    throw new ConflictException(
      'Fulfilment state changed. Refresh and try again.',
    );
  }
  private prismaCode(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
  private postgresCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    if (
      'code' in error &&
      ['23P01', '40001', '40P01'].includes(String(error.code))
    )
      return String(error.code);
    if ('meta' in error) {
      const meta = error.meta;
      if (typeof meta === 'object' && meta !== null && 'code' in meta)
        return String(meta.code);
    }
    return undefined;
  }
}
