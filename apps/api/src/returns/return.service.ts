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
  InventoryState,
  InventoryTrackingMode,
  InventoryTransactionAction,
  InventoryTransactionKind,
  Prisma,
  RentalIssueResolutionOutcome,
  RentalIssueStatus,
  RentalIssueType,
  RentalReturnDisposition,
  RentalReturnStatus,
  ReturnActivityType,
  UserStatus,
  prisma,
} from '@mensah-rentals/database';
import type {
  AdminRentalIssueResponse,
  AdminRentalReturnListResponse,
  AdminRentalReturnResponse,
} from '@mensah-rentals/types';
import type {
  CreateRentalIssueInput,
  IssueListQuery,
  RecordReturnInput,
  ResolveRentalIssueInput,
  ReturnListQuery,
  ReturnVersionCommandInput,
} from '@mensah-rentals/validation';

import {
  buildSelectableTextPdf,
  safePdfFilename,
} from '../common/selectable-text-pdf';

const returnInclude = {
  activeRental: {
    include: { rentalOrder: true },
  },
  items: {
    include: {
      activeRentalItem: {
        include: {
          rentalOrderItem: true,
          orderFulfilmentItem: {
            include: {
              reservationItem: { include: { inventory: true } },
            },
          },
          serializedAssets: {
            include: { inventoryItem: true, returnedAsset: true },
            orderBy: { checkedOutAt: 'asc' as const },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  issues: true,
} satisfies Prisma.RentalReturnInclude;

type ReturnRecord = Prisma.RentalReturnGetPayload<{
  include: typeof returnInclude;
}>;

interface ReturnIntakeDraft {
  activeRentalId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  projectName: string;
  status: null;
  version: 0;
  items: Array<Record<string, unknown>>;
  notice: string;
}

interface AdminRentalIssueListResponse {
  items: AdminRentalIssueResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ReturnService {
  async record(
    actorId: string,
    activeRentalId: string,
    input: RecordReturnInput,
  ): Promise<AdminRentalReturnResponse> {
    const payloadHash = this.hash({
      action: 'RETURN_INTAKE',
      activeRentalId,
      ...input,
    });
    const returnId = await this.mutate(async (tx) => {
      await this.lockActiveRental(tx, activeRentalId);
      await this.requireActor(tx, actorId, ['return.create', 'return.inspect']);
      const replay = await tx.rentalReturnOperation.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) {
        if (
          replay.actorUserId !== actorId ||
          replay.payloadHash !== payloadHash
        )
          throw new ConflictException(
            'Operation ID was already used for a different return command',
          );
        return replay.rentalReturnId;
      }
      const active = await tx.activeRental.findUnique({
        where: { id: activeRentalId },
        include: {
          rentalOrder: true,
          rentalReturn: true,
          items: {
            include: {
              rentalOrderItem: true,
              orderFulfilmentItem: {
                include: {
                  reservationItem: { include: { inventory: true } },
                },
              },
              serializedAssets: { include: { inventoryItem: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      });
      if (!active) throw new NotFoundException('Active rental not found');
      if (
        !(
          [
            ActiveRentalStatus.ACTIVE,
            ActiveRentalStatus.PARTIALLY_ACTIVE,
            ActiveRentalStatus.PARTIALLY_RETURNED,
            ActiveRentalStatus.AWAITING_RECONCILIATION,
          ] as ActiveRentalStatus[]
        ).includes(active.status)
      )
        throw new UnprocessableEntityException(
          'This rental cannot accept another return operation',
        );

      let rentalReturn = active.rentalReturn;
      if (!rentalReturn) {
        if (input.expectedVersion !== 0)
          throw new ConflictException(
            'Return state changed. Refresh and try again.',
          );
        rentalReturn = await tx.rentalReturn.create({
          data: {
            activeRentalId,
            createdByUserId: actorId,
            firstReturnAt: new Date(input.receivedAt),
            returnNumber: `RET-${active.rentalOrder.orderNumber}`,
            status: RentalReturnStatus.PARTIALLY_RETURNED,
            updatedByUserId: actorId,
          },
        });
        await tx.rentalReturnItem.createMany({
          data: active.items.map((item) => ({
            activeRentalItemId: item.id,
            expectedCheckedOutQuantity: item.checkedOutQuantity,
            outstandingQuantity: item.checkedOutQuantity,
            rentalReturnId: rentalReturn!.id,
          })),
        });
      } else if (rentalReturn.version !== input.expectedVersion) {
        throw new ConflictException(
          'Return state changed. Refresh and try again.',
        );
      }

      const returnItems = await tx.rentalReturnItem.findMany({
        where: { rentalReturnId: rentalReturn.id },
        orderBy: { id: 'asc' },
      });
      const returnItemByActiveId = new Map(
        returnItems.map((item) => [item.activeRentalItemId, item]),
      );
      const activeItemById = new Map(
        active.items.map((item) => [item.id, item]),
      );
      const accounted = input.items.reduce(
        (sum, item) =>
          sum +
          item.quantityRentable +
          item.quantityDamaged +
          item.quantityMaintenance +
          item.quantityMissing,
        0,
      );
      const totalOutstanding = returnItems.reduce(
        (sum, item) => sum + item.outstandingQuantity,
        0,
      );
      if (accounted < totalOutstanding)
        await this.requireActor(tx, actorId, ['return.partial']);

      const operation = await tx.rentalReturnOperation.create({
        data: {
          actorUserId: actorId,
          customerSafeNotes: input.customerSafeNotes,
          expectedVersion: input.expectedVersion,
          internalNotes: input.internalNotes,
          operationId: input.operationId,
          payloadHash,
          receivedAt: new Date(input.receivedAt),
          rentalReturnId: rentalReturn.id,
          resultingVersion: input.expectedVersion + 1,
        },
      });

      for (const inputItem of input.items) {
        const activeItem = activeItemById.get(inputItem.activeRentalItemId);
        const returnItem = returnItemByActiveId.get(
          inputItem.activeRentalItemId,
        );
        if (!activeItem || !returnItem)
          throw new UnprocessableEntityException(
            'Return item does not belong to this active rental',
          );
        const quantityReceived =
          inputItem.quantityRentable +
          inputItem.quantityDamaged +
          inputItem.quantityMaintenance;
        const quantityAccounted = quantityReceived + inputItem.quantityMissing;
        if (quantityAccounted > returnItem.outstandingQuantity)
          throw new UnprocessableEntityException(
            'Return quantity exceeds the outstanding checked-out quantity',
          );
        const trackingMode =
          activeItem.orderFulfilmentItem.reservationItem.inventory.trackingMode;
        if (
          trackingMode === InventoryTrackingMode.SERIALIZED &&
          inputItem.serializedAssets.length !== quantityAccounted
        )
          throw new UnprocessableEntityException(
            'Every serialized quantity must identify its checkout occurrence',
          );
        if (
          trackingMode === InventoryTrackingMode.BULK &&
          inputItem.serializedAssets.length > 0
        )
          throw new UnprocessableEntityException(
            'Bulk returns cannot contain serialized assets',
          );
        const operationItem = await tx.rentalReturnOperationItem.create({
          data: {
            quantityDamaged: inputItem.quantityDamaged,
            quantityMaintenance: inputItem.quantityMaintenance,
            quantityMissing: inputItem.quantityMissing,
            quantityReceived,
            quantityRentable: inputItem.quantityRentable,
            rentalReturnItemId: returnItem.id,
            returnOperationId: operation.id,
          },
        });
        const inventoryId =
          activeItem.orderFulfilmentItem.reservationItem.inventoryId;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${inventoryId}, 0))`;
        if (trackingMode === InventoryTrackingMode.BULK) {
          for (const movement of this.bulkMovements(inputItem)) {
            await tx.inventoryTransaction.create({
              data: {
                action: movement.action,
                actorUserId: actorId,
                fromState: InventoryState.RENTED,
                inventoryId,
                kind: InventoryTransactionKind.BULK_MOVEMENT,
                operationId: this.derivedUuid(
                  input.operationId,
                  `${returnItem.id}:${movement.toState}`,
                ),
                quantity: movement.quantity,
                reason: `Return intake for ${active.rentalOrder.orderNumber}`,
                returnOperationItemId: operationItem.id,
                toState: movement.toState,
              },
            });
          }
        } else {
          const activeAssetById = new Map(
            activeItem.serializedAssets.map((asset) => [asset.id, asset]),
          );
          for (const outcome of inputItem.serializedAssets) {
            const asset = activeAssetById.get(
              outcome.activeRentalSerializedAssetId,
            );
            if (!asset || asset.inventoryItem.status !== InventoryState.RENTED)
              throw new UnprocessableEntityException(
                'Serialized asset is not eligible for return',
              );
            const toState = this.dispositionState(outcome.disposition);
            const returnedAsset = await tx.returnedSerializedAsset.create({
              data: {
                activeRentalSerializedAssetId: asset.id,
                disposition: outcome.disposition,
                inspectionNotes: outcome.inspectionNotes,
                inventoryItemId: asset.inventoryItemId,
                receivedAt:
                  outcome.disposition === RentalReturnDisposition.MISSING
                    ? null
                    : new Date(input.receivedAt),
                returnOperationItemId: operationItem.id,
              },
            });
            await tx.inventoryTransaction.create({
              data: {
                action: this.returnAction(toState),
                actorUserId: actorId,
                fromState: InventoryState.RENTED,
                inventoryId,
                inventoryItemId: asset.inventoryItemId,
                kind: InventoryTransactionKind.SERIALIZED_ITEM_STATE_CHANGED,
                operationId: this.derivedUuid(input.operationId, asset.id),
                quantity: 1,
                reason: `Serialized return intake for ${active.rentalOrder.orderNumber}`,
                returnOperationItemId: operationItem.id,
                toState,
              },
            });
            await tx.inventoryItem.update({
              where: { id: asset.inventoryItemId },
              data: { status: toState },
            });
            if (outcome.disposition !== RentalReturnDisposition.RENTABLE)
              await this.createIssue(tx, {
                actorId,
                inventoryItemId: asset.inventoryItemId,
                operationItemId: operationItem.id,
                returnId: rentalReturn.id,
                returnItemId: returnItem.id,
                returnedAssetId: returnedAsset.id,
                type: this.issueType(outcome.disposition),
                quantity: 1,
              });
          }
        }
        if (trackingMode === InventoryTrackingMode.BULK) {
          for (const [type, issueQuantity] of [
            [RentalIssueType.DAMAGED, inputItem.quantityDamaged],
            [
              RentalIssueType.MAINTENANCE_REQUIRED,
              inputItem.quantityMaintenance,
            ],
            [RentalIssueType.MISSING, inputItem.quantityMissing],
          ] as const)
            if (issueQuantity > 0)
              await this.createIssue(tx, {
                actorId,
                operationItemId: operationItem.id,
                returnId: rentalReturn.id,
                returnItemId: returnItem.id,
                type,
                quantity: issueQuantity,
              });
        }
        await tx.rentalReturnItem.update({
          where: { id: returnItem.id },
          data: {
            damagedQuantity: { increment: inputItem.quantityDamaged },
            maintenanceQuantity: { increment: inputItem.quantityMaintenance },
            missingQuantity: { increment: inputItem.quantityMissing },
            outstandingQuantity: { decrement: quantityAccounted },
            receivedQuantity: { increment: quantityReceived },
            rentableQuantity: { increment: inputItem.quantityRentable },
          },
        });
      }

      const remaining = await tx.rentalReturnItem.aggregate({
        where: { rentalReturnId: rentalReturn.id },
        _sum: { outstandingQuantity: true },
      });
      const outstanding = remaining._sum.outstandingQuantity ?? 0;
      const blockerCount = await tx.rentalIssue.count({
        where: {
          rentalReturnId: rentalReturn.id,
          blocksCompletion: true,
          status: { not: RentalIssueStatus.RESOLVED },
        },
      });
      const status =
        outstanding > 0
          ? RentalReturnStatus.PARTIALLY_RETURNED
          : blockerCount > 0
            ? RentalReturnStatus.RECONCILIATION_REQUIRED
            : RentalReturnStatus.READY_TO_COMPLETE;
      await tx.rentalReturn.update({
        where: { id: rentalReturn.id },
        data: {
          fullyAccountedAt:
            outstanding === 0 ? new Date(input.receivedAt) : null,
          status,
          updatedByUserId: actorId,
          version: { increment: 1 },
        },
      });
      await tx.activeRental.update({
        where: { id: activeRentalId },
        data: {
          status:
            outstanding > 0
              ? ActiveRentalStatus.PARTIALLY_RETURNED
              : ActiveRentalStatus.AWAITING_RECONCILIATION,
          version: { increment: 1 },
        },
      });
      await tx.returnActivity.create({
        data: {
          actorUserId: actorId,
          rentalReturnId: rentalReturn.id,
          summary: `${quantityReceived(input)} received and ${quantityMissing(input)} confirmed missing.`,
          type: ReturnActivityType.RETURN_RECORDED,
        },
      });
      return rentalReturn.id;
    });
    return this.detail(actorId, returnId);
  }

  async forActiveRental(
    actorId: string,
    activeRentalId: string,
  ): Promise<AdminRentalReturnResponse | ReturnIntakeDraft> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['return.view']);
      const existing = await tx.rentalReturn.findUnique({
        where: { activeRentalId },
        include: returnInclude,
      });
      if (existing) return this.mapReturn(existing);
      const active = await tx.activeRental.findUnique({
        where: { id: activeRentalId },
        include: {
          rentalOrder: true,
          items: {
            include: {
              rentalOrderItem: true,
              orderFulfilmentItem: {
                include: { reservationItem: { include: { inventory: true } } },
              },
              serializedAssets: { include: { inventoryItem: true } },
            },
          },
        },
      });
      if (!active) throw new NotFoundException('Active rental not found');
      return {
        activeRentalId: active.id,
        orderId: active.rentalOrderId,
        orderNumber: active.rentalOrder.orderNumber,
        customerName: `${active.rentalOrder.contactFirstNameSnapshot} ${active.rentalOrder.contactLastNameSnapshot}`,
        projectName: active.rentalOrder.projectNameSnapshot,
        status: null,
        version: 0,
        items: active.items.map((item) => ({
          activeRentalItemId: item.id,
          productName: item.rentalOrderItem.productNameSnapshot,
          rentalUnit: item.rentalOrderItem.rentalUnitSnapshot,
          trackingMode:
            item.orderFulfilmentItem.reservationItem.inventory.trackingMode,
          expectedCheckedOutQuantity: item.checkedOutQuantity,
          receivedQuantity: 0,
          rentableQuantity: 0,
          damagedQuantity: 0,
          maintenanceQuantity: 0,
          missingQuantity: 0,
          outstandingQuantity: item.checkedOutQuantity,
          serializedAssets: item.serializedAssets.map((asset) => ({
            activeRentalSerializedAssetId: asset.id,
            assetNumber: asset.inventoryItem.assetNumber,
            serialNumber: asset.inventoryItem.serialNumber,
            accounted: false,
            disposition: null,
          })),
        })),
        notice:
          'Internal return data. Never expose inventory or serialized asset details publicly.',
      };
    });
  }

  async list(
    actorId: string,
    query: ReturnListQuery,
  ): Promise<AdminRentalReturnListResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['return.view']);
      const where: Prisma.RentalReturnWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  returnNumber: { contains: query.search, mode: 'insensitive' },
                },
                {
                  activeRental: {
                    rentalOrder: {
                      orderNumber: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
                {
                  activeRental: {
                    rentalOrder: {
                      projectNameSnapshot: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        tx.rentalReturn.count({ where }),
        tx.rentalReturn.findMany({
          where,
          include: returnInclude,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return {
        items: rows.map((row) => {
          const mapped = this.mapReturn(row);
          return {
            id: mapped.id,
            returnNumber: mapped.returnNumber,
            activeRentalId: mapped.activeRentalId,
            orderId: mapped.orderId,
            orderNumber: mapped.orderNumber,
            customerName: mapped.customerName,
            projectName: mapped.projectName,
            status: mapped.status,
            version: mapped.version,
            firstReturnAt: mapped.firstReturnAt,
            completedAt: mapped.completedAt,
            issueCount: mapped.issueCount,
            blockingIssueCount: mapped.blockingIssueCount,
          };
        }),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        },
      };
    });
  }

  async detail(
    actorId: string,
    returnId: string,
  ): Promise<AdminRentalReturnResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['return.view']);
      const row = await tx.rentalReturn.findUnique({
        where: { id: returnId },
        include: returnInclude,
      });
      if (!row) throw new NotFoundException('Rental return not found');
      return this.mapReturn(row);
    });
  }

  async reconcile(
    actorId: string,
    returnId: string,
    input: ReturnVersionCommandInput,
  ): Promise<AdminRentalReturnResponse> {
    await this.transition(actorId, returnId, input, 'reconcile');
    return this.detail(actorId, returnId);
  }

  async complete(
    actorId: string,
    returnId: string,
    input: ReturnVersionCommandInput,
  ): Promise<AdminRentalReturnResponse> {
    await this.transition(actorId, returnId, input, 'complete');
    return this.detail(actorId, returnId);
  }

  async createManualIssue(
    actorId: string,
    returnId: string,
    input: CreateRentalIssueInput,
  ): Promise<AdminRentalIssueResponse> {
    const payloadHash = this.hash({
      action: 'CREATE_ISSUE',
      returnId,
      ...input,
    });
    const issueId = await this.mutate(async (tx) => {
      await this.lockReturn(tx, returnId);
      await this.requireActor(tx, actorId, ['rental_issue.update']);
      const rentalReturn = await tx.rentalReturn.findUnique({
        where: { id: returnId },
        include: { items: true },
      });
      if (!rentalReturn) throw new NotFoundException('Rental return not found');
      if (rentalReturn.version !== input.expectedReturnVersion)
        throw new ConflictException(
          'Return state changed. Refresh and try again.',
        );
      const existing = await tx.returnActivity.findFirst({
        where: {
          metadata: { path: ['operationId'], equals: input.operationId },
        },
      });
      if (existing) {
        const metadata = existing.metadata as Record<string, unknown>;
        if (metadata.payloadHash !== payloadHash)
          throw new ConflictException(
            'Operation ID was already used differently',
          );
        return String(metadata.issueId);
      }
      const returnItem = input.activeRentalItemId
        ? rentalReturn.items.find(
            (item) => item.activeRentalItemId === input.activeRentalItemId,
          )
        : undefined;
      if (input.activeRentalItemId && !returnItem)
        throw new UnprocessableEntityException(
          'Issue item does not belong to this return',
        );
      const issue = await tx.rentalIssue.create({
        data: {
          blocksCompletion: input.blocksCompletion,
          createdByUserId: actorId,
          customerSafeDescription: input.customerSafeDescription,
          internalDescription: input.internalDescription,
          openQuantity: input.quantity,
          quantity: input.quantity,
          rentalReturnId: returnId,
          rentalReturnItemId: returnItem?.id,
          type: input.type,
        },
      });
      await tx.rentalReturn.update({
        where: { id: returnId },
        data: {
          status: RentalReturnStatus.RECONCILIATION_REQUIRED,
          updatedByUserId: actorId,
          version: { increment: 1 },
        },
      });
      await tx.returnActivity.create({
        data: {
          actorUserId: actorId,
          metadata: {
            issueId: issue.id,
            operationId: input.operationId,
            payloadHash,
          },
          rentalReturnId: returnId,
          summary: 'Manual return issue created.',
          type: ReturnActivityType.ISSUE_CREATED,
        },
      });
      return issue.id;
    });
    return this.issueDetail(actorId, issueId);
  }

  async issueList(
    actorId: string,
    query: IssueListQuery,
  ): Promise<AdminRentalIssueListResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['rental_issue.view']);
      const where: Prisma.RentalIssueWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  rentalReturn: {
                    returnNumber: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  rentalReturn: {
                    activeRental: {
                      rentalOrder: {
                        orderNumber: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        tx.rentalIssue.count({ where }),
        tx.rentalIssue.findMany({
          where,
          include: this.issueInclude(),
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return {
        items: rows.map((row) => this.mapIssue(row)),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        },
      };
    });
  }

  async issueDetail(
    actorId: string,
    issueId: string,
  ): Promise<AdminRentalIssueResponse> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['rental_issue.view']);
      const issue = await tx.rentalIssue.findUnique({
        where: { id: issueId },
        include: this.issueInclude(),
      });
      if (!issue) throw new NotFoundException('Rental issue not found');
      return this.mapIssue(issue);
    });
  }

  async resolveIssue(
    actorId: string,
    issueId: string,
    input: ResolveRentalIssueInput,
  ): Promise<AdminRentalIssueResponse> {
    const payloadHash = this.hash({
      action: 'RESOLVE_ISSUE',
      issueId,
      ...input,
    });
    await this.mutate(async (tx) => {
      const issueRoot = await tx.rentalIssue.findUnique({
        where: { id: issueId },
        select: { rentalReturnId: true },
      });
      if (!issueRoot) throw new NotFoundException('Rental issue not found');
      await this.lockReturn(tx, issueRoot.rentalReturnId);
      await this.requireActor(tx, actorId, [
        'rental_issue.resolve',
        'return.reconcile',
      ]);
      const replay = await tx.rentalIssueResolution.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) {
        if (
          replay.rentalIssueId !== issueId ||
          replay.actorUserId !== actorId ||
          replay.payloadHash !== payloadHash
        )
          throw new ConflictException(
            'Operation ID was already used differently',
          );
        return;
      }
      const issue = await tx.rentalIssue.findUnique({
        where: { id: issueId },
        include: {
          rentalReturn: true,
          rentalReturnItem: {
            include: {
              activeRentalItem: {
                include: {
                  orderFulfilmentItem: { include: { reservationItem: true } },
                },
              },
            },
          },
        },
      });
      if (!issue) throw new NotFoundException('Rental issue not found');
      if (
        issue.version !== input.expectedIssueVersion ||
        issue.rentalReturn.version !== input.expectedReturnVersion
      )
        throw new ConflictException(
          'Issue or return changed. Refresh and try again.',
        );
      const physical = (
        [
          RentalIssueResolutionOutcome.ITEM_RETURNED,
          RentalIssueResolutionOutcome.REPAIRED,
          RentalIssueResolutionOutcome.WRITTEN_OFF,
        ] as RentalIssueResolutionOutcome[]
      ).includes(input.outcome);
      if (input.quantity > issue.openQuantity)
        throw new UnprocessableEntityException(
          'Resolution quantity exceeds the unresolved issue quantity',
        );
      const resolution = await tx.rentalIssueResolution.create({
        data: {
          actorUserId: actorId,
          assessedCentsDelta: BigInt(input.assessedCentsDelta),
          customerSafeNote: input.customerSafeNote,
          expectedVersion: input.expectedIssueVersion,
          internalReason: input.internalReason,
          operationId: input.operationId,
          outcome: input.outcome,
          paidCentsDelta: BigInt(input.paidCentsDelta),
          payloadHash,
          quantity: input.quantity,
          rentalIssueId: issueId,
          resultingInventoryState: input.resultingInventoryState,
          resultingVersion: input.expectedIssueVersion + 1,
        },
      });
      if (physical) {
        const fromState = this.issueSourceState(issue.type);
        const toState = input.resultingInventoryState! as InventoryState;
        this.validateResolutionTransition(input.outcome, fromState, toState);
        const inventoryId = issue.inventoryItemId
          ? (
              await tx.inventoryItem.findUniqueOrThrow({
                where: { id: issue.inventoryItemId },
              })
            ).inventoryId
          : issue.rentalReturnItem?.activeRentalItem.orderFulfilmentItem
              .reservationItem.inventoryId;
        if (!inventoryId)
          throw new UnprocessableEntityException(
            'This issue has no inventory source for a physical resolution',
          );
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${inventoryId}, 0))`;
        await tx.inventoryTransaction.create({
          data: {
            action: this.resolutionAction(input.outcome, toState),
            actorUserId: actorId,
            fromState,
            inventoryId,
            inventoryItemId: issue.inventoryItemId,
            issueResolutionId: resolution.id,
            kind: issue.inventoryItemId
              ? InventoryTransactionKind.SERIALIZED_ITEM_STATE_CHANGED
              : InventoryTransactionKind.BULK_MOVEMENT,
            operationId: this.derivedUuid(input.operationId, issueId),
            quantity: input.quantity,
            reason: input.internalReason,
            toState,
          },
        });
        if (issue.inventoryItemId)
          await tx.inventoryItem.update({
            where: { id: issue.inventoryItemId },
            data: { status: toState },
          });
      }
      // A commercial waiver/payment can close the staff issue without claiming
      // that the physical equipment was recovered. Only `physical` outcomes
      // write inventory history; non-physical outcomes leave the existing
      // MISSING/DAMAGED/MAINTENANCE bucket unchanged.
      const closedQuantity = input.quantity;
      const openQuantity = issue.openQuantity - closedQuantity;
      await tx.rentalIssue.update({
        where: { id: issueId },
        data: {
          amountAssessedCents: { increment: BigInt(input.assessedCentsDelta) },
          amountPaidCents: { increment: BigInt(input.paidCentsDelta) },
          openQuantity,
          status:
            openQuantity === 0 ? RentalIssueStatus.RESOLVED : issue.status,
          version: { increment: 1 },
        },
      });
      await tx.rentalReturn.update({
        where: { id: issue.rentalReturnId },
        data: { updatedByUserId: actorId, version: { increment: 1 } },
      });
      await tx.returnActivity.create({
        data: {
          actorUserId: actorId,
          metadata: {
            issueId,
            outcome: input.outcome,
            quantity: input.quantity,
          },
          rentalReturnId: issue.rentalReturnId,
          summary: physical
            ? 'Physical issue resolution recorded.'
            : 'Issue resolution recorded without an inventory movement.',
          type: physical
            ? ReturnActivityType.ITEM_RECOVERED
            : ReturnActivityType.ISSUE_RESOLVED,
        },
      });
    });
    return this.issueDetail(actorId, issueId);
  }

  async pdf(
    actorId: string,
    returnId: string,
    kind: 'receipt' | 'inspection' | 'missing' | 'damage' | 'reconciliation',
  ) {
    const snapshot = await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['return.view', 'return.pdf']);
      const row = await tx.rentalReturn.findUnique({
        where: { id: returnId },
        include: returnInclude,
      });
      if (!row) throw new NotFoundException('Rental return not found');
      return this.mapReturn(row);
    });
    const lines = [
      `Return: ${snapshot.returnNumber}`,
      `Order: ${snapshot.orderNumber}`,
      `Customer: ${snapshot.customerName}`,
      `Project: ${snapshot.projectName}`,
      `Status: ${snapshot.status}`,
      '',
      ...snapshot.items.flatMap((item) => [
        `${item.productName}: expected ${item.expectedCheckedOutQuantity}; received ${item.receivedQuantity}; rentable ${item.rentableQuantity}; damaged ${item.damagedQuantity}; maintenance ${item.maintenanceQuantity}; missing ${item.missingQuantity}; outstanding ${item.outstandingQuantity}`,
        ...item.serializedAssets.map(
          (asset) =>
            `Asset ${asset.assetNumber}${asset.serialNumber ? ` / ${asset.serialNumber}` : ''}: ${asset.disposition ?? 'OUTSTANDING'}`,
        ),
      ]),
      '',
      `Open blocking issues: ${snapshot.blockingIssueCount}`,
    ];
    return {
      buffer: buildSelectableTextPdf({
        title: `Mensah Rentals ${kind} report`,
        lines,
      }),
      filename: safePdfFilename(snapshot.returnNumber, kind),
    };
  }

  private async transition(
    actorId: string,
    returnId: string,
    input: ReturnVersionCommandInput,
    action: 'reconcile' | 'complete',
  ) {
    const payloadHash = this.hash({ action, returnId, ...input });
    await this.mutate(async (tx) => {
      await this.lockReturn(tx, returnId);
      await this.requireActor(
        tx,
        actorId,
        action === 'complete'
          ? ['return.reconcile', 'return.complete']
          : ['return.reconcile'],
      );
      const prior = await tx.returnActivity.findFirst({
        where: {
          metadata: { path: ['operationId'], equals: input.operationId },
        },
      });
      if (prior) {
        const metadata = prior.metadata as Record<string, unknown>;
        if (metadata.payloadHash !== payloadHash)
          throw new ConflictException(
            'Operation ID was already used differently',
          );
        return;
      }
      const row = await tx.rentalReturn.findUnique({
        where: { id: returnId },
        include: {
          activeRental: {
            include: {
              orderFulfilment: {
                include: { inventoryReservation: { include: { items: true } } },
              },
            },
          },
          items: true,
          issues: true,
        },
      });
      if (!row) throw new NotFoundException('Rental return not found');
      if (row.version !== input.expectedVersion)
        throw new ConflictException(
          'Return state changed. Refresh and try again.',
        );
      if (row.items.some((item) => item.outstandingQuantity !== 0))
        throw new UnprocessableEntityException(
          'All checked-out quantities must be accounted for first',
        );
      const blockers = row.issues.filter(
        (issue) =>
          issue.blocksCompletion && issue.status !== RentalIssueStatus.RESOLVED,
      );
      if (action === 'reconcile') {
        await tx.rentalReturn.update({
          where: { id: returnId },
          data: {
            reconciledAt: blockers.length ? null : new Date(),
            status: blockers.length
              ? RentalReturnStatus.RECONCILIATION_REQUIRED
              : RentalReturnStatus.READY_TO_COMPLETE,
            updatedByUserId: actorId,
            version: { increment: 1 },
          },
        });
      } else {
        if (
          blockers.length ||
          row.status !== RentalReturnStatus.READY_TO_COMPLETE
        )
          throw new UnprocessableEntityException(
            'Blocking issues must be resolved and the return reconciled first',
          );
        if (
          row.activeRental.orderFulfilment.inventoryReservation.items.some(
            (item) => item.reservedQuantity > 0,
          )
        )
          throw new UnprocessableEntityException(
            'Remaining reservation commitments must be released before completion',
          );
        const now = new Date();
        await tx.rentalReturn.update({
          where: { id: returnId },
          data: {
            completedAt: now,
            completedByUserId: actorId,
            status: RentalReturnStatus.COMPLETED,
            updatedByUserId: actorId,
            version: { increment: 1 },
          },
        });
        await tx.activeRental.update({
          where: { id: row.activeRentalId },
          data: {
            status: ActiveRentalStatus.COMPLETED,
            version: { increment: 1 },
          },
        });
      }
      await tx.returnActivity.create({
        data: {
          actorUserId: actorId,
          metadata: { operationId: input.operationId, payloadHash },
          rentalReturnId: returnId,
          summary:
            action === 'complete'
              ? 'Rental return completed.'
              : 'Rental return reconciliation evaluated.',
          type:
            action === 'complete'
              ? ReturnActivityType.COMPLETED
              : blockers.length
                ? ReturnActivityType.RECONCILIATION_REQUESTED
                : ReturnActivityType.RECONCILED,
        },
      });
    });
  }

  private async createIssue(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      returnId: string;
      returnItemId: string;
      operationItemId: string;
      returnedAssetId?: string;
      inventoryItemId?: string;
      type: RentalIssueType;
      quantity: number;
    },
  ) {
    return tx.rentalIssue.create({
      data: {
        createdByUserId: input.actorId,
        customerSafeDescription:
          'An equipment condition or missing-item issue is under review.',
        internalDescription: `${input.type.replaceAll('_', ' ').toLowerCase()} recorded during return intake.`,
        inventoryItemId: input.inventoryItemId,
        openQuantity: input.quantity,
        quantity: input.quantity,
        rentalReturnId: input.returnId,
        rentalReturnItemId: input.returnItemId,
        returnedSerializedAssetId: input.returnedAssetId,
        sourceReturnOperationItemId: input.operationItemId,
        type: input.type,
      },
    });
  }

  private mapReturn(row: ReturnRecord): AdminRentalReturnResponse {
    return {
      id: row.id,
      returnNumber: row.returnNumber,
      activeRentalId: row.activeRentalId,
      orderId: row.activeRental.rentalOrderId,
      orderNumber: row.activeRental.rentalOrder.orderNumber,
      customerName: `${row.activeRental.rentalOrder.contactFirstNameSnapshot} ${row.activeRental.rentalOrder.contactLastNameSnapshot}`,
      projectName: row.activeRental.rentalOrder.projectNameSnapshot,
      status: row.status,
      version: row.version,
      firstReturnAt: row.firstReturnAt.toISOString(),
      fullyAccountedAt: row.fullyAccountedAt?.toISOString() ?? null,
      reconciledAt: row.reconciledAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      items: row.items.map((item) => ({
        id: item.id,
        activeRentalItemId: item.activeRentalItemId,
        productName: item.activeRentalItem.rentalOrderItem.productNameSnapshot,
        rentalUnit: item.activeRentalItem.rentalOrderItem.rentalUnitSnapshot,
        trackingMode:
          item.activeRentalItem.orderFulfilmentItem.reservationItem.inventory
            .trackingMode,
        expectedCheckedOutQuantity: item.expectedCheckedOutQuantity,
        receivedQuantity: item.receivedQuantity,
        rentableQuantity: item.rentableQuantity,
        damagedQuantity: item.damagedQuantity,
        maintenanceQuantity: item.maintenanceQuantity,
        missingQuantity: item.missingQuantity,
        outstandingQuantity: item.outstandingQuantity,
        serializedAssets: item.activeRentalItem.serializedAssets.map(
          (asset) => ({
            activeRentalSerializedAssetId: asset.id,
            assetNumber: asset.inventoryItem.assetNumber,
            serialNumber: asset.inventoryItem.serialNumber,
            accounted: Boolean(asset.returnedAsset),
            disposition: asset.returnedAsset?.disposition ?? null,
          }),
        ),
      })),
      issueCount: row.issues.length,
      blockingIssueCount: row.issues.filter(
        (issue) =>
          issue.blocksCompletion && issue.status !== RentalIssueStatus.RESOLVED,
      ).length,
      notice:
        'Internal return and issue data. Never expose inventory, serialized assets, staff, or internal notes publicly.',
    };
  }

  private issueInclude() {
    return {
      inventoryItem: true,
      rentalReturn: {
        include: { activeRental: { include: { rentalOrder: true } } },
      },
      rentalReturnItem: {
        include: { activeRentalItem: { include: { rentalOrderItem: true } } },
      },
    } satisfies Prisma.RentalIssueInclude;
  }

  private mapIssue(
    row: Prisma.RentalIssueGetPayload<{
      include: ReturnType<ReturnService['issueInclude']>;
    }>,
  ): AdminRentalIssueResponse {
    return {
      id: row.id,
      returnId: row.rentalReturnId,
      returnNumber: row.rentalReturn.returnNumber,
      orderNumber: row.rentalReturn.activeRental.rentalOrder.orderNumber,
      type: row.type,
      status: row.status,
      version: row.version,
      quantity: row.quantity,
      openQuantity: row.openQuantity,
      blocksCompletion: row.blocksCompletion,
      internalDescription: row.internalDescription,
      customerSafeDescription: row.customerSafeDescription,
      amountAssessedCents: row.amountAssessedCents.toString(),
      amountPaidCents: row.amountPaidCents.toString(),
      productName:
        row.rentalReturnItem?.activeRentalItem.rentalOrderItem
          .productNameSnapshot ?? null,
      assetNumber: row.inventoryItem?.assetNumber ?? null,
      serialNumber: row.inventoryItem?.serialNumber ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private bulkMovements(item: RecordReturnInput['items'][number]) {
    return [
      {
        quantity: item.quantityRentable,
        toState: InventoryState.RENTABLE,
        action: InventoryTransactionAction.RETURN_TO_RENTABLE,
      },
      {
        quantity: item.quantityDamaged,
        toState: InventoryState.DAMAGED,
        action: InventoryTransactionAction.RETURN_TO_DAMAGED,
      },
      {
        quantity: item.quantityMaintenance,
        toState: InventoryState.MAINTENANCE,
        action: InventoryTransactionAction.RETURN_TO_MAINTENANCE,
      },
      {
        quantity: item.quantityMissing,
        toState: InventoryState.MISSING,
        action: InventoryTransactionAction.MARK_MISSING,
      },
    ].filter((movement) => movement.quantity > 0);
  }

  private dispositionState(
    disposition: RentalReturnDisposition,
  ): InventoryState {
    return disposition === RentalReturnDisposition.MISSING
      ? InventoryState.MISSING
      : (disposition as InventoryState);
  }

  private issueType(disposition: RentalReturnDisposition): RentalIssueType {
    if (disposition === RentalReturnDisposition.DAMAGED)
      return RentalIssueType.DAMAGED;
    if (disposition === RentalReturnDisposition.MAINTENANCE)
      return RentalIssueType.MAINTENANCE_REQUIRED;
    return RentalIssueType.MISSING;
  }

  private returnAction(toState: InventoryState): InventoryTransactionAction {
    if (toState === InventoryState.RENTABLE)
      return InventoryTransactionAction.RETURN_TO_RENTABLE;
    if (toState === InventoryState.DAMAGED)
      return InventoryTransactionAction.RETURN_TO_DAMAGED;
    if (toState === InventoryState.MAINTENANCE)
      return InventoryTransactionAction.RETURN_TO_MAINTENANCE;
    return InventoryTransactionAction.MARK_MISSING;
  }

  private issueSourceState(type: RentalIssueType): InventoryState {
    if (type === RentalIssueType.MISSING) return InventoryState.MISSING;
    if (type === RentalIssueType.DAMAGED) return InventoryState.DAMAGED;
    if (type === RentalIssueType.MAINTENANCE_REQUIRED)
      return InventoryState.MAINTENANCE;
    throw new UnprocessableEntityException(
      'This issue does not represent a physical inventory state',
    );
  }

  private validateResolutionTransition(
    outcome: RentalIssueResolutionOutcome,
    from: InventoryState,
    to: InventoryState,
  ) {
    if (
      outcome === RentalIssueResolutionOutcome.ITEM_RETURNED &&
      from !== InventoryState.MISSING
    )
      throw new UnprocessableEntityException(
        'Only missing equipment can be recovered as returned',
      );
    if (
      outcome === RentalIssueResolutionOutcome.REPAIRED &&
      !(
        [InventoryState.DAMAGED, InventoryState.MAINTENANCE] as InventoryState[]
      ).includes(from)
    )
      throw new UnprocessableEntityException(
        'Only damaged or maintenance equipment can be repaired',
      );
    if (
      outcome === RentalIssueResolutionOutcome.WRITTEN_OFF &&
      !(
        [InventoryState.LOST, InventoryState.RETIRED] as InventoryState[]
      ).includes(to)
    )
      throw new UnprocessableEntityException(
        'Write-off must move equipment to LOST or RETIRED',
      );
    if (
      outcome !== RentalIssueResolutionOutcome.WRITTEN_OFF &&
      !(
        [
          InventoryState.RENTABLE,
          InventoryState.DAMAGED,
          InventoryState.MAINTENANCE,
        ] as InventoryState[]
      ).includes(to)
    )
      throw new UnprocessableEntityException(
        'Recovery target must be rentable, damaged, or maintenance',
      );
  }

  private resolutionAction(
    outcome: RentalIssueResolutionOutcome,
    to: InventoryState,
  ): InventoryTransactionAction {
    if (outcome === RentalIssueResolutionOutcome.WRITTEN_OFF)
      return InventoryTransactionAction.WRITE_OFF;
    if (outcome === RentalIssueResolutionOutcome.REPAIRED)
      return InventoryTransactionAction.REPAIR_COMPLETE;
    if (to === InventoryState.RENTABLE)
      return InventoryTransactionAction.RECOVER_MISSING_TO_RENTABLE;
    if (to === InventoryState.DAMAGED)
      return InventoryTransactionAction.RECOVER_MISSING_TO_DAMAGED;
    return InventoryTransactionAction.RECOVER_MISSING_TO_MAINTENANCE;
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

  private async lockActiveRental(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "ActiveRental" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Active rental not found');
  }

  private async lockReturn(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "RentalReturn" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Rental return not found');
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
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : undefined;
        const databaseCode =
          typeof error === 'object' &&
          error &&
          'meta' in error &&
          typeof (error as { meta?: { code?: unknown } }).meta?.code ===
            'string'
            ? (error as { meta: { code: string } }).meta.code
            : undefined;
        if (
          (code === 'P2034' ||
            code === 'P2002' ||
            ['40001', '40P01', '23P01'].includes(databaseCode ?? '')) &&
          attempt < 2
        )
          continue;
        if (
          code === 'P2002' ||
          code === 'P2034' ||
          ['40001', '40P01', '23P01'].includes(databaseCode ?? '')
        )
          throw new ConflictException(
            'Return state changed. Refresh and try again.',
          );
        throw error;
      }
    }
    throw new ConflictException('Return state changed. Refresh and try again.');
  }
}

function quantityReceived(input: RecordReturnInput) {
  return input.items.reduce(
    (sum, item) =>
      sum +
      item.quantityRentable +
      item.quantityDamaged +
      item.quantityMaintenance,
    0,
  );
}

function quantityMissing(input: RecordReturnInput) {
  return input.items.reduce((sum, item) => sum + item.quantityMissing, 0);
}
