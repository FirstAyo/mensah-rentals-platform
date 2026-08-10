import { createHash, randomInt } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  EquipmentInspectionStatus,
  EquipmentInspectionType,
  InventoryState,
  InventoryTrackingMode,
  InventoryTransactionAction,
  InventoryTransactionKind,
  MaintenanceCompletionOutcome,
  MaintenanceOperationType,
  MaintenanceWorkOrderSource,
  MaintenanceWorkOrderStatus,
  Prisma,
  RentalIssueResolutionOutcome,
  RentalIssueStatus,
  RentalIssueType,
  ReturnActivityType,
  UserStatus,
  prisma,
} from '@mensah-rentals/database';

type JsonObject = Record<string, unknown>;

export interface MaintenanceListInput {
  page: number;
  pageSize: number;
  search?: string;
  status?: MaintenanceWorkOrderStatus;
  priority?: string;
  type?: string;
  source?: MaintenanceWorkOrderSource;
  assignedToUserId?: string;
  inventoryId?: string;
  inventoryItemId?: string;
  overdue?: boolean;
  sortBy: 'createdAt' | 'updatedAt' | 'scheduledFor' | 'dueAt' | 'priority';
  sortDirection: 'asc' | 'desc';
}

export interface InspectionListInput {
  page: number;
  pageSize: number;
  search?: string;
  status?: EquipmentInspectionStatus;
  type?: EquipmentInspectionType;
  assignedToUserId?: string;
  inventoryId?: string;
  inventoryItemId?: string;
  overdue?: boolean;
  sortBy: 'createdAt' | 'updatedAt' | 'scheduledFor';
  sortDirection: 'asc' | 'desc';
}

interface OperationInput {
  operationId: string;
  expectedVersion: number;
}

interface WorkOrderCreateInput {
  operationId: string;
  source: MaintenanceWorkOrderSource;
  type: string;
  priority: string;
  title: string;
  description: string;
  inventoryId: string;
  inventoryItemId?: string | null;
  sourceState?: InventoryState;
  quantity: number;
  sourceRentalReturnItemId?: string | null;
  sourceRentalIssueId?: string | null;
  sourceInspectionId?: string | null;
  assignedStaffUserId?: string | null;
  scheduledFor?: string | null;
  dueAt?: string | null;
}

interface InspectionCreateInput {
  operationId: string;
  type: EquipmentInspectionType;
  inventoryId: string;
  inventoryItemId?: string | null;
  quantity: number;
  sourceWorkOrderId?: string | null;
  assignedStaffUserId?: string | null;
  scheduledFor: string;
}

const workOrderInclude = {
  inventory: { include: { product: true } },
  inventoryItem: true,
  sourceRentalIssue: {
    select: {
      id: true,
      rentalReturnId: true,
      status: true,
      type: true,
      openQuantity: true,
    },
  },
  assignedStaff: {
    select: { id: true, firstName: true, lastName: true, status: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, status: true },
  },
  completedBy: {
    select: { id: true, firstName: true, lastName: true, status: true },
  },
  notes: {
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  operations: {
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  inspections: {
    include: {
      assignedStaff: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
    orderBy: [{ scheduledFor: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.MaintenanceWorkOrderInclude;

const inspectionInclude = {
  inventory: { include: { product: true } },
  inventoryItem: true,
  sourceWorkOrder: {
    select: { id: true, workOrderNumber: true, status: true, version: true },
  },
  generatedWorkOrder: {
    select: { id: true, workOrderNumber: true, status: true },
  },
  assignedStaff: {
    select: { id: true, firstName: true, lastName: true, status: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, status: true },
  },
  completedBy: {
    select: { id: true, firstName: true, lastName: true, status: true },
  },
  operations: {
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.EquipmentInspectionInclude;

type WorkOrderRecord = Prisma.MaintenanceWorkOrderGetPayload<{
  include: typeof workOrderInclude;
}>;
type InspectionRecord = Prisma.EquipmentInspectionGetPayload<{
  include: typeof inspectionInclude;
}>;

const ACTIVE_WORK_ORDER_STATUSES: MaintenanceWorkOrderStatus[] = [
  MaintenanceWorkOrderStatus.OPEN,
  MaintenanceWorkOrderStatus.ASSIGNED,
  MaintenanceWorkOrderStatus.IN_PROGRESS,
  MaintenanceWorkOrderStatus.WAITING_FOR_PARTS,
  MaintenanceWorkOrderStatus.READY_FOR_INSPECTION,
];
const ACTIVE_INSPECTION_STATUSES: EquipmentInspectionStatus[] = [
  EquipmentInspectionStatus.SCHEDULED,
  EquipmentInspectionStatus.IN_PROGRESS,
];

@Injectable()
export class MaintenanceService {
  async listWorkOrders(
    actorId: string,
    query: MaintenanceListInput,
  ): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['maintenance.view']);
      const now = new Date();
      const where: Prisma.MaintenanceWorkOrderWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority as never } : {}),
        ...(query.type ? { type: query.type as never } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.assignedToUserId
          ? { assignedStaffUserId: query.assignedToUserId }
          : {}),
        ...(query.inventoryId ? { inventoryId: query.inventoryId } : {}),
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(query.overdue === true
          ? {
              dueAt: { lt: now },
              status: { in: ACTIVE_WORK_ORDER_STATUSES },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                {
                  workOrderNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  productNameSnapshot: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  assetNumberSnapshot: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  serialNumberSnapshot: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        tx.maintenanceWorkOrder.count({ where }),
        tx.maintenanceWorkOrder.findMany({
          where,
          include: workOrderInclude,
          orderBy: [
            { [query.sortBy]: query.sortDirection },
            { id: 'asc' },
          ] as Prisma.MaintenanceWorkOrderOrderByWithRelationInput[],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return this.page(
        rows.map((row) => this.mapWorkOrder(row)),
        query,
        total,
      );
    });
  }

  async workOrder(actorId: string, id: string): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['maintenance.view']);
      return this.loadWorkOrder(tx, id);
    });
  }

  async createWorkOrder(
    actorId: string,
    input: WorkOrderCreateInput,
  ): Promise<unknown> {
    const payloadHash = this.hash({ action: 'CREATE_WORK_ORDER', ...input });
    const id = await this.mutate(async (tx) => {
      await this.lockInventory(tx, input.inventoryId);
      const required = ['maintenance.create'];
      if (input.assignedStaffUserId) required.push('maintenance.assign');
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        required,
        input.operationId,
        payloadHash,
        'workOrderId',
      );
      if (replay) return replay;
      const target = await tx.inventory.findUnique({
        where: { id: input.inventoryId },
        include: { product: true, items: true },
      });
      if (!target) throw new NotFoundException('Inventory not found');
      const item = input.inventoryItemId
        ? target.items.find(({ id }) => id === input.inventoryItemId)
        : null;
      this.validateTarget(target.trackingMode, item, input.quantity);
      if (input.assignedStaffUserId)
        await this.requireActiveAssignee(tx, input.assignedStaffUserId);

      const sourceState = await this.resolveWorkOrderSourceState(tx, input);
      const movementRequired = sourceState !== InventoryState.MAINTENANCE;
      if (movementRequired)
        await this.requireActor(tx, actorId, [
          ...required,
          'maintenance.inventory_transition',
        ]);
      await this.ensureTargetAvailable(
        tx,
        input.inventoryId,
        input.inventoryItemId ?? null,
        input.quantity,
        sourceState,
      );

      const workOrder = await tx.maintenanceWorkOrder.create({
        data: {
          workOrderNumber: await this.nextNumber(tx, 'workOrder'),
          source: input.source,
          type: input.type as never,
          status: input.assignedStaffUserId
            ? MaintenanceWorkOrderStatus.ASSIGNED
            : MaintenanceWorkOrderStatus.OPEN,
          priority: input.priority as never,
          title: input.title,
          description: input.description,
          inventoryId: input.inventoryId,
          inventoryItemId: input.inventoryItemId ?? null,
          quantity: input.quantity,
          ingressState: sourceState,
          ingressMoved: movementRequired,
          productNameSnapshot: target.product.name,
          assetNumberSnapshot: item?.assetNumber ?? null,
          serialNumberSnapshot: item?.serialNumber ?? null,
          sourceRentalReturnItemId: input.sourceRentalReturnItemId ?? null,
          sourceRentalIssueId: input.sourceRentalIssueId ?? null,
          sourceInspectionId: input.sourceInspectionId ?? null,
          assignedStaffUserId: input.assignedStaffUserId ?? null,
          createdByStaffUserId: actorId,
          scheduledFor: input.scheduledFor
            ? new Date(input.scheduledFor)
            : null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        },
      });
      const operation = await tx.maintenanceOperation.create({
        data: {
          workOrderId: workOrder.id,
          type: MaintenanceOperationType.CREATED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: 0,
          resultingVersion: 0,
          summary: 'Maintenance work order created.',
          metadata: {
            ingressState: sourceState,
            inventoryMovedOnCreate: movementRequired,
          },
        },
      });
      if (movementRequired)
        await this.moveInventory(tx, {
          actorId,
          inventoryId: input.inventoryId,
          inventoryItemId: input.inventoryItemId ?? null,
          quantity: input.quantity,
          fromState: sourceState,
          toState: InventoryState.MAINTENANCE,
          action: InventoryTransactionAction.ENTER_MAINTENANCE,
          operationId: this.derivedUuid(input.operationId, 'enter-maintenance'),
          maintenanceOperationId: operation.id,
          reason: `Maintenance work order ${workOrder.workOrderNumber} opened`,
        });
      return workOrder.id;
    });
    return this.workOrder(actorId, id);
  }

  async assign(
    actorId: string,
    id: string,
    input: OperationInput & { assignedStaffUserId: string },
  ): Promise<unknown> {
    return this.workOrderMutation(actorId, id, input, {
      permission: 'maintenance.assign',
      type: MaintenanceOperationType.ASSIGNED,
      allowed: ACTIVE_WORK_ORDER_STATUSES,
      summary: 'Maintenance work order assigned.',
      apply: async (tx) => {
        await this.requireActiveAssignee(tx, input.assignedStaffUserId);
        const current = await tx.maintenanceWorkOrder.findUniqueOrThrow({
          where: { id },
          select: { status: true },
        });
        return {
          assignedStaffUserId: input.assignedStaffUserId,
          status:
            current.status === MaintenanceWorkOrderStatus.OPEN
              ? MaintenanceWorkOrderStatus.ASSIGNED
              : current.status,
        };
      },
      metadata: { assignedStaffUserId: input.assignedStaffUserId },
    });
  }

  async unassign(
    actorId: string,
    id: string,
    input: OperationInput,
  ): Promise<unknown> {
    return this.workOrderMutation(actorId, id, input, {
      permission: 'maintenance.assign',
      type: MaintenanceOperationType.UNASSIGNED,
      allowed: ACTIVE_WORK_ORDER_STATUSES,
      summary: 'Maintenance work order unassigned.',
      apply: async (_tx, row) => ({
        assignedStaffUserId: null,
        status:
          row.status === MaintenanceWorkOrderStatus.ASSIGNED
            ? MaintenanceWorkOrderStatus.OPEN
            : row.status,
      }),
    });
  }

  async updateWorkOrder(
    actorId: string,
    id: string,
    input: OperationInput & object,
  ): Promise<unknown> {
    const scheduleChanged = 'scheduledFor' in input || 'dueAt' in input;
    const priorityChanged = 'priority' in input;
    return this.workOrderMutation(actorId, id, input, {
      permission: 'maintenance.update',
      type: scheduleChanged
        ? MaintenanceOperationType.SCHEDULE_CHANGED
        : MaintenanceOperationType.PRIORITY_CHANGED,
      allowed: ACTIVE_WORK_ORDER_STATUSES,
      summary: 'Maintenance work order details updated.',
      apply: async () => ({
        ...('title' in input ? { title: input.title as string } : {}),
        ...('description' in input
          ? { description: input.description as string }
          : {}),
        ...(priorityChanged ? { priority: input.priority as never } : {}),
        ...('scheduledFor' in input
          ? {
              scheduledFor: input.scheduledFor
                ? new Date(input.scheduledFor as string)
                : null,
            }
          : {}),
        ...('dueAt' in input
          ? { dueAt: input.dueAt ? new Date(input.dueAt as string) : null }
          : {}),
      }),
    });
  }

  async start(
    actorId: string,
    id: string,
    input: OperationInput & object,
  ): Promise<unknown> {
    return this.simpleTransition(actorId, id, input, {
      allowed: [
        MaintenanceWorkOrderStatus.OPEN,
        MaintenanceWorkOrderStatus.ASSIGNED,
      ],
      next: MaintenanceWorkOrderStatus.IN_PROGRESS,
      type: MaintenanceOperationType.STARTED,
      summary: 'Maintenance work started.',
      timestamp: 'startedAt',
    });
  }

  async waitingForParts(
    actorId: string,
    id: string,
    input: OperationInput & object,
  ): Promise<unknown> {
    return this.simpleTransition(actorId, id, input, {
      allowed: [MaintenanceWorkOrderStatus.IN_PROGRESS],
      next: MaintenanceWorkOrderStatus.WAITING_FOR_PARTS,
      type: MaintenanceOperationType.WAITING_FOR_PARTS,
      summary: 'Maintenance is waiting for parts.',
    });
  }

  async resume(
    actorId: string,
    id: string,
    input: OperationInput & object,
  ): Promise<unknown> {
    return this.simpleTransition(actorId, id, input, {
      allowed: [MaintenanceWorkOrderStatus.WAITING_FOR_PARTS],
      next: MaintenanceWorkOrderStatus.IN_PROGRESS,
      type: MaintenanceOperationType.WORK_RESUMED,
      summary: 'Maintenance work resumed.',
    });
  }

  async readyForInspection(
    actorId: string,
    id: string,
    input: OperationInput & object,
  ): Promise<unknown> {
    return this.simpleTransition(actorId, id, input, {
      allowed: [MaintenanceWorkOrderStatus.IN_PROGRESS],
      next: MaintenanceWorkOrderStatus.READY_FOR_INSPECTION,
      type: MaintenanceOperationType.READY_FOR_INSPECTION,
      summary: 'Maintenance is ready for inspection.',
      timestamp: 'readyForInspectionAt',
    });
  }

  async addNote(
    actorId: string,
    id: string,
    input: OperationInput & { body: string },
  ): Promise<unknown> {
    const payloadHash = this.hash({ action: 'NOTE', id, ...input });
    await this.mutate(async (tx) => {
      await this.lockWorkOrder(tx, id);
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        ['maintenance.note'],
        input.operationId,
        payloadHash,
        'workOrderId',
      );
      if (replay) return;
      const row = await tx.maintenanceWorkOrder.findUnique({ where: { id } });
      this.requireWorkOrderVersion(row, input.expectedVersion);
      if (!ACTIVE_WORK_ORDER_STATUSES.includes(row!.status))
        throw new ConflictException(
          'Terminal work orders cannot receive notes',
        );
      const operation = await tx.maintenanceOperation.create({
        data: {
          workOrderId: id,
          type: MaintenanceOperationType.NOTE_ADDED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          resultingVersion: input.expectedVersion + 1,
          summary: 'Internal maintenance note added.',
        },
      });
      await tx.maintenanceNote.create({
        data: {
          workOrderId: id,
          operationId: operation.id,
          authorUserId: actorId,
          body: input.body,
        },
      });
      await tx.maintenanceWorkOrder.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
    });
    return this.workOrder(actorId, id);
  }

  async cancel(
    actorId: string,
    id: string,
    input: OperationInput & { cancellationReason: string },
  ): Promise<unknown> {
    const payloadHash = this.hash({ action: 'CANCEL', id, ...input });
    await this.mutate(async (tx) => {
      const row = await this.lockAndLoadWorkOrder(tx, id);
      const moved = row.ingressMoved;
      const required = ['maintenance.cancel'];
      if (moved) required.push('maintenance.inventory_transition');
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        required,
        input.operationId,
        payloadHash,
        'workOrderId',
      );
      if (replay) return;
      this.requireWorkOrderVersion(row, input.expectedVersion);
      if (!ACTIVE_WORK_ORDER_STATUSES.includes(row.status))
        throw new ConflictException('This work order is already terminal');
      const operation = await tx.maintenanceOperation.create({
        data: {
          workOrderId: id,
          type: MaintenanceOperationType.CANCELLED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          resultingVersion: input.expectedVersion + 1,
          summary: 'Maintenance work order cancelled.',
          metadata: { cancellationReason: input.cancellationReason },
        },
      });
      if (moved) {
        await this.moveInventory(tx, {
          actorId,
          inventoryId: row.inventoryId,
          inventoryItemId: row.inventoryItemId,
          quantity: row.quantity,
          fromState: InventoryState.MAINTENANCE,
          toState: row.ingressState,
          action: InventoryTransactionAction.MAINTENANCE_CANCELLED_RELEASE,
          operationId: this.derivedUuid(input.operationId, 'cancel-release'),
          maintenanceOperationId: operation.id,
          reason: `Cancellation of ${row.workOrderNumber}`,
        });
      }
      await tx.maintenanceWorkOrder.update({
        where: { id },
        data: {
          status: MaintenanceWorkOrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: input.cancellationReason,
          version: { increment: 1 },
        },
      });
    });
    return this.workOrder(actorId, id);
  }

  async complete(
    actorId: string,
    id: string,
    input: OperationInput & {
      completionOutcome: MaintenanceCompletionOutcome;
      completionSummary: string;
      resolveLinkedIssueAsRepaired?: boolean;
      expectedIssueVersion?: number;
      expectedReturnVersion?: number;
    },
  ): Promise<unknown> {
    const payloadHash = this.hash({ action: 'COMPLETE', id, ...input });
    await this.mutate(async (tx) => {
      const row = await this.lockAndLoadWorkOrder(tx, id);
      const required = [
        'maintenance.complete',
        'maintenance.inventory_transition',
      ];
      if (input.resolveLinkedIssueAsRepaired)
        required.push('rental_issue.resolve', 'return.reconcile');
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        required,
        input.operationId,
        payloadHash,
        'workOrderId',
      );
      if (replay) return;
      this.requireWorkOrderVersion(row, input.expectedVersion);
      if (row.status !== MaintenanceWorkOrderStatus.READY_FOR_INSPECTION)
        throw new ConflictException('Work order is not ready for completion');
      const passed = await tx.equipmentInspection.findFirst({
        where: {
          sourceWorkOrderId: id,
          type: EquipmentInspectionType.POST_MAINTENANCE,
          status: EquipmentInspectionStatus.PASSED,
          completedAt: { gte: row.readyForInspectionAt ?? new Date(0) },
        },
      });
      if (!passed)
        throw new UnprocessableEntityException(
          'A passed post-maintenance inspection is required',
        );
      const destination =
        input.completionOutcome ===
        MaintenanceCompletionOutcome.RETURN_TO_SERVICE
          ? InventoryState.RENTABLE
          : InventoryState.DAMAGED;
      const operation = await tx.maintenanceOperation.create({
        data: {
          workOrderId: id,
          type: MaintenanceOperationType.COMPLETED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          resultingVersion: input.expectedVersion + 1,
          summary: 'Maintenance work order completed.',
          metadata: { completionOutcome: input.completionOutcome },
        },
      });
      const issueResolutionId = input.resolveLinkedIssueAsRepaired
        ? await this.resolveLinkedIssue(tx, actorId, row, input)
        : null;
      await this.moveInventory(tx, {
        actorId,
        inventoryId: row.inventoryId,
        inventoryItemId: row.inventoryItemId,
        quantity: row.quantity,
        fromState: InventoryState.MAINTENANCE,
        toState: destination,
        action:
          destination === InventoryState.RENTABLE
            ? InventoryTransactionAction.MAINTENANCE_RETURN_TO_SERVICE
            : InventoryTransactionAction.MAINTENANCE_REMAINS_DAMAGED,
        operationId: this.derivedUuid(input.operationId, 'completion'),
        maintenanceOperationId: operation.id,
        issueResolutionId,
        reason: input.completionSummary,
      });
      await tx.maintenanceWorkOrder.update({
        where: { id },
        data: {
          status: MaintenanceWorkOrderStatus.COMPLETED,
          completedAt: new Date(),
          completedByStaffUserId: actorId,
          completionOutcome: input.completionOutcome,
          completionSummary: input.completionSummary,
          version: { increment: 1 },
        },
      });
    });
    return this.workOrder(actorId, id);
  }

  async listInspections(
    actorId: string,
    query: InspectionListInput,
  ): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['inspection.view']);
      const where: Prisma.EquipmentInspectionWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.assignedToUserId
          ? { assignedStaffUserId: query.assignedToUserId }
          : {}),
        ...(query.inventoryId ? { inventoryId: query.inventoryId } : {}),
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(query.overdue
          ? {
              scheduledFor: { lt: new Date() },
              status: { in: ACTIVE_INSPECTION_STATUSES },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                {
                  inspectionNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  productNameSnapshot: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  assetNumberSnapshot: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  serialNumberSnapshot: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        tx.equipmentInspection.count({ where }),
        tx.equipmentInspection.findMany({
          where,
          include: inspectionInclude,
          orderBy: [
            { [query.sortBy]: query.sortDirection },
            { id: 'asc' },
          ] as Prisma.EquipmentInspectionOrderByWithRelationInput[],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return this.page(
        rows.map((row) => this.mapInspection(row)),
        query,
        total,
      );
    });
  }

  async inspection(actorId: string, id: string): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['inspection.view']);
      return this.loadInspection(tx, id);
    });
  }

  async createInspection(
    actorId: string,
    input: InspectionCreateInput,
  ): Promise<unknown> {
    const payloadHash = this.hash({ action: 'CREATE_INSPECTION', ...input });
    const id = await this.mutate(async (tx) => {
      await this.lockInventory(tx, input.inventoryId);
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        ['inspection.create'],
        input.operationId,
        payloadHash,
        'inspectionId',
      );
      if (replay) return replay;
      const inventory = await tx.inventory.findUnique({
        where: { id: input.inventoryId },
        include: { product: true, items: true },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      const item = input.inventoryItemId
        ? inventory.items.find(({ id }) => id === input.inventoryItemId)
        : null;
      this.validateTarget(inventory.trackingMode, item, input.quantity);
      if (input.assignedStaffUserId)
        await Promise.all([
          this.requireActor(tx, actorId, ['maintenance.assign']),
          this.requireActiveAssignee(tx, input.assignedStaffUserId),
        ]);
      if (input.type === EquipmentInspectionType.POST_MAINTENANCE) {
        const workOrder = await tx.maintenanceWorkOrder.findUnique({
          where: { id: input.sourceWorkOrderId! },
        });
        if (!workOrder)
          throw new NotFoundException('Maintenance work order not found');
        if (
          workOrder.status !==
            MaintenanceWorkOrderStatus.READY_FOR_INSPECTION ||
          workOrder.inventoryId !== input.inventoryId ||
          workOrder.inventoryItemId !== (input.inventoryItemId ?? null) ||
          workOrder.quantity !== input.quantity
        )
          throw new ConflictException(
            'Work order target is not ready for this inspection',
          );
      }
      const inspection = await tx.equipmentInspection.create({
        data: {
          inspectionNumber: await this.nextNumber(tx, 'inspection'),
          type: input.type,
          inventoryId: input.inventoryId,
          inventoryItemId: input.inventoryItemId ?? null,
          quantity: input.quantity,
          ingressState: null,
          ingressMoved: false,
          productNameSnapshot: inventory.product.name,
          assetNumberSnapshot: item?.assetNumber ?? null,
          serialNumberSnapshot: item?.serialNumber ?? null,
          sourceWorkOrderId: input.sourceWorkOrderId ?? null,
          assignedStaffUserId: input.assignedStaffUserId ?? null,
          createdByStaffUserId: actorId,
          scheduledFor: new Date(input.scheduledFor),
        },
      });
      await tx.maintenanceOperation.create({
        data: {
          inspectionId: inspection.id,
          type: MaintenanceOperationType.INSPECTION_SCHEDULED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: 0,
          resultingVersion: 0,
          summary: 'Equipment inspection scheduled.',
        },
      });
      return inspection.id;
    });
    return this.inspection(actorId, id);
  }

  async startInspection(
    actorId: string,
    id: string,
    input: OperationInput,
  ): Promise<unknown> {
    const payloadHash = this.hash({ action: 'START_INSPECTION', id, ...input });
    await this.mutate(async (tx) => {
      const row = await this.lockAndLoadInspection(tx, id);
      await this.lockInventory(tx, row.inventoryId);
      const routineMove = row.type === EquipmentInspectionType.ROUTINE;
      const required = ['inspection.perform'];
      if (routineMove) required.push('maintenance.inventory_transition');
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        required,
        input.operationId,
        payloadHash,
        'inspectionId',
      );
      if (replay) return;
      this.requireInspectionVersion(row, input.expectedVersion);
      if (row.status !== EquipmentInspectionStatus.SCHEDULED)
        throw new ConflictException(
          'Inspection cannot be started from its current state',
        );
      const sourceState =
        row.type === EquipmentInspectionType.ROUTINE
          ? InventoryState.RENTABLE
          : InventoryState.MAINTENANCE;
      if (row.type === EquipmentInspectionType.ROUTINE) {
        await this.ensureTargetAvailable(
          tx,
          row.inventoryId,
          row.inventoryItemId,
          row.quantity,
          InventoryState.RENTABLE,
        );
      } else if (row.inventoryItemId) {
        const item = await tx.inventoryItem.findFirst({
          where: {
            id: row.inventoryItemId,
            inventoryId: row.inventoryId,
            status: InventoryState.MAINTENANCE,
          },
          select: { id: true },
        });
        if (!item)
          throw new ConflictException(
            'Post-maintenance equipment is no longer in maintenance',
          );
      } else if (
        (await this.bulkBalance(
          tx,
          row.inventoryId,
          InventoryState.MAINTENANCE,
        )) < row.quantity
      ) {
        throw new ConflictException(
          'Post-maintenance equipment is no longer in maintenance',
        );
      }
      const operation = await tx.maintenanceOperation.create({
        data: {
          inspectionId: id,
          type: MaintenanceOperationType.INSPECTION_STARTED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          resultingVersion: input.expectedVersion + 1,
          summary: 'Equipment inspection started.',
          metadata: {
            ingressState: sourceState,
            inventoryMovedOnStart: routineMove,
          },
        },
      });
      if (routineMove)
        await this.moveInventory(tx, {
          actorId,
          inventoryId: row.inventoryId,
          inventoryItemId: row.inventoryItemId,
          quantity: row.quantity,
          fromState: sourceState,
          toState: InventoryState.MAINTENANCE,
          action: InventoryTransactionAction.ENTER_MAINTENANCE,
          operationId: this.derivedUuid(input.operationId, 'inspection-enter'),
          maintenanceOperationId: operation.id,
          reason: `Routine inspection ${row.inspectionNumber}`,
        });
      await tx.equipmentInspection.update({
        where: { id },
        data: {
          status: EquipmentInspectionStatus.IN_PROGRESS,
          startedAt: new Date(),
          ingressState: sourceState,
          ingressMoved: routineMove,
          version: { increment: 1 },
        },
      });
    });
    return this.inspection(actorId, id);
  }

  async passInspection(
    actorId: string,
    id: string,
    input: OperationInput & { summary: string },
  ): Promise<unknown> {
    return this.finishInspection(actorId, id, input, true);
  }

  async failInspection(
    actorId: string,
    id: string,
    input: OperationInput & { summary: string },
  ): Promise<unknown> {
    return this.finishInspection(actorId, id, input, false);
  }

  async cancelInspection(
    actorId: string,
    id: string,
    input: OperationInput & { cancellationReason: string },
  ): Promise<unknown> {
    const payloadHash = this.hash({
      action: 'CANCEL_INSPECTION',
      id,
      ...input,
    });
    await this.mutate(async (tx) => {
      const row = await this.lockAndLoadInspection(tx, id);
      const moved = row.ingressMoved;
      const required = ['inspection.cancel'];
      if (moved) required.push('maintenance.inventory_transition');
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        required,
        input.operationId,
        payloadHash,
        'inspectionId',
      );
      if (replay) return;
      this.requireInspectionVersion(row, input.expectedVersion);
      if (!ACTIVE_INSPECTION_STATUSES.includes(row.status))
        throw new ConflictException('This inspection is already terminal');
      const operation = await tx.maintenanceOperation.create({
        data: {
          inspectionId: id,
          type: MaintenanceOperationType.INSPECTION_CANCELLED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          resultingVersion: input.expectedVersion + 1,
          summary: 'Equipment inspection cancelled.',
          metadata: { cancellationReason: input.cancellationReason },
        },
      });
      if (moved)
        await this.moveInventory(tx, {
          actorId,
          inventoryId: row.inventoryId,
          inventoryItemId: row.inventoryItemId,
          quantity: row.quantity,
          fromState: InventoryState.MAINTENANCE,
          toState: row.ingressState!,
          action: InventoryTransactionAction.MAINTENANCE_CANCELLED_RELEASE,
          operationId: this.derivedUuid(input.operationId, 'inspection-cancel'),
          maintenanceOperationId: operation.id,
          reason: `Cancelled inspection ${row.inspectionNumber}`,
        });
      await tx.equipmentInspection.update({
        where: { id },
        data: {
          status: EquipmentInspectionStatus.CANCELLED,
          cancelledAt: new Date(),
          summary: input.cancellationReason,
          version: { increment: 1 },
        },
      });
    });
    return this.inspection(actorId, id);
  }

  async assignees(
    actorId: string,
    query: { search?: string; pageSize: number },
  ): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, ['maintenance.assign']);
      const users = await tx.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          roles: {
            some: {
              role: {
                permissions: {
                  some: { permission: { key: 'maintenance.update' } },
                },
              },
            },
          },
          ...(query.search
            ? {
                OR: [
                  {
                    firstName: { contains: query.search, mode: 'insensitive' },
                  },
                  { lastName: { contains: query.search, mode: 'insensitive' } },
                  { email: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { id: true, firstName: true, lastName: true, status: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
        take: query.pageSize,
      });
      return users;
    });
  }

  async issueSource(actorId: string, issueId: string): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'maintenance.create',
        'rental_issue.view',
      ]);
      const issue = await tx.rentalIssue.findUnique({
        where: { id: issueId },
        include: {
          inventoryItem: {
            include: { inventory: { include: { product: true } } },
          },
          rentalReturnItem: {
            include: {
              activeRentalItem: {
                include: {
                  rentalOrderItem: true,
                  orderFulfilmentItem: {
                    include: {
                      reservationItem: {
                        include: { inventory: { include: { product: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!issue) throw new NotFoundException('Rental issue not found');
      const inventory =
        issue.inventoryItem?.inventory ??
        issue.rentalReturnItem?.activeRentalItem.orderFulfilmentItem
          .reservationItem.inventory;
      if (!inventory)
        throw new UnprocessableEntityException(
          'Rental issue has no maintenance inventory target',
        );
      const claimed = await tx.maintenanceWorkOrder.aggregate({
        where: {
          sourceRentalIssueId: issue.id,
          status: { in: ACTIVE_WORK_ORDER_STATUSES },
        },
        _sum: { quantity: true },
      });
      const available = Math.max(
        0,
        issue.openQuantity - (claimed._sum.quantity ?? 0),
      );
      return {
        source: MaintenanceWorkOrderSource.RETURN_ISSUE,
        sourceRentalIssueId: issue.id,
        eligible:
          issue.status !== RentalIssueStatus.RESOLVED &&
          available > 0 &&
          [
            RentalIssueType.DAMAGED,
            RentalIssueType.MAINTENANCE_REQUIRED,
          ].includes(issue.type as never),
        inventoryId: inventory.id,
        inventoryItemId: issue.inventoryItemId,
        quantityAvailable: available,
        productName: inventory.product.name,
        assetNumber: issue.inventoryItem?.assetNumber ?? null,
        serialNumber: issue.inventoryItem?.serialNumber ?? null,
      };
    });
  }

  async returnItemSource(
    actorId: string,
    returnItemId: string,
  ): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'maintenance.create',
        'return.view',
      ]);
      const item = await tx.rentalReturnItem.findUnique({
        where: { id: returnItemId },
        include: {
          activeRentalItem: {
            include: {
              rentalOrderItem: true,
              orderFulfilmentItem: {
                include: {
                  reservationItem: {
                    include: { inventory: { include: { product: true } } },
                  },
                },
              },
              serializedAssets: {
                include: { inventoryItem: true, returnedAsset: true },
              },
            },
          },
        },
      });
      if (!item) throw new NotFoundException('Rental return item not found');
      const inventory =
        item.activeRentalItem.orderFulfilmentItem.reservationItem.inventory;
      if (!inventory)
        throw new UnprocessableEntityException(
          'Return item has no Mensah inventory maintenance target',
        );
      const claims = await tx.maintenanceWorkOrder.findMany({
        where: {
          sourceRentalReturnItemId: item.id,
          status: { in: ACTIVE_WORK_ORDER_STATUSES },
        },
        select: { inventoryItemId: true, quantity: true },
      });
      if (inventory.trackingMode === InventoryTrackingMode.SERIALIZED) {
        const claimedIds = new Set(
          claims.map(({ inventoryItemId }) => inventoryItemId).filter(Boolean),
        );
        return {
          source: MaintenanceWorkOrderSource.RETURN_DISPOSITION,
          sourceRentalReturnItemId: item.id,
          eligible: item.activeRentalItem.serializedAssets.some(
            ({ inventoryItemId, returnedAsset }) =>
              returnedAsset?.disposition === 'MAINTENANCE' &&
              !claimedIds.has(inventoryItemId),
          ),
          inventoryId: inventory.id,
          productName: inventory.product.name,
          targets: item.activeRentalItem.serializedAssets
            .filter(
              ({ inventoryItemId, returnedAsset }) =>
                returnedAsset?.disposition === 'MAINTENANCE' &&
                !claimedIds.has(inventoryItemId),
            )
            .map(({ inventoryItem }) => ({
              inventoryItemId: inventoryItem.id,
              quantityAvailable: 1,
              assetNumber: inventoryItem.assetNumber,
              serialNumber: inventoryItem.serialNumber,
            })),
        };
      }
      const available = Math.max(
        0,
        item.maintenanceQuantity -
          claims.reduce((sum, claim) => sum + claim.quantity, 0),
      );
      return {
        source: MaintenanceWorkOrderSource.RETURN_DISPOSITION,
        sourceRentalReturnItemId: item.id,
        eligible: available > 0,
        inventoryId: inventory.id,
        inventoryItemId: null,
        quantityAvailable: available,
        productName: inventory.product.name,
        assetNumber: null,
        serialNumber: null,
      };
    });
  }

  private async finishInspection(
    actorId: string,
    id: string,
    input: OperationInput & { summary: string },
    passed: boolean,
  ) {
    const payloadHash = this.hash({
      action: passed ? 'PASS_INSPECTION' : 'FAIL_INSPECTION',
      id,
      ...input,
    });
    await this.mutate(async (tx) => {
      const row = await this.lockAndLoadInspection(tx, id);
      const routineRelease =
        passed &&
        row.type === EquipmentInspectionType.ROUTINE &&
        row.ingressMoved;
      const required = ['inspection.perform'];
      if (routineRelease) required.push('maintenance.inventory_transition');
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        required,
        input.operationId,
        payloadHash,
        'inspectionId',
      );
      if (replay) return;
      this.requireInspectionVersion(row, input.expectedVersion);
      if (row.status !== EquipmentInspectionStatus.IN_PROGRESS)
        throw new ConflictException('Inspection is not in progress');
      const operation = await tx.maintenanceOperation.create({
        data: {
          inspectionId: id,
          type: passed
            ? MaintenanceOperationType.INSPECTION_PASSED
            : MaintenanceOperationType.INSPECTION_FAILED,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          resultingVersion: input.expectedVersion + 1,
          summary: passed
            ? 'Equipment inspection passed.'
            : 'Equipment inspection failed.',
          metadata: { resultSummary: input.summary },
        },
      });
      if (routineRelease)
        await this.moveInventory(tx, {
          actorId,
          inventoryId: row.inventoryId,
          inventoryItemId: row.inventoryItemId,
          quantity: row.quantity,
          fromState: InventoryState.MAINTENANCE,
          toState: row.ingressState!,
          action: InventoryTransactionAction.MAINTENANCE_RETURN_TO_SERVICE,
          operationId: this.derivedUuid(input.operationId, 'inspection-pass'),
          maintenanceOperationId: operation.id,
          reason: `Passed routine inspection ${row.inspectionNumber}`,
        });
      if (!passed && row.sourceWorkOrderId) {
        await this.lockWorkOrder(tx, row.sourceWorkOrderId);
        const sourceWorkOrder = await tx.maintenanceWorkOrder.findUnique({
          where: { id: row.sourceWorkOrderId },
        });
        if (
          sourceWorkOrder &&
          sourceWorkOrder.status ===
            MaintenanceWorkOrderStatus.READY_FOR_INSPECTION
        ) {
          await tx.maintenanceOperation.create({
            data: {
              workOrderId: sourceWorkOrder.id,
              // INSPECTION_FAILED belongs to the inspection-scoped history row
              // created above. The owning work order records its return to work
              // with a work-order-scoped operation shape accepted by the DB.
              type: MaintenanceOperationType.WORK_RESUMED,
              operationId: this.derivedUuid(
                input.operationId,
                'work-order-inspection-failed',
              ),
              payloadHash,
              actorUserId: actorId,
              expectedVersion: sourceWorkOrder.version,
              resultingVersion: sourceWorkOrder.version + 1,
              summary: `Post-maintenance inspection ${row.inspectionNumber} failed.`,
              metadata: { inspectionId: row.id },
            },
          });
        }
        await tx.maintenanceWorkOrder.updateMany({
          where: {
            id: row.sourceWorkOrderId,
            status: MaintenanceWorkOrderStatus.READY_FOR_INSPECTION,
          },
          data: {
            status: MaintenanceWorkOrderStatus.IN_PROGRESS,
            readyForInspectionAt: null,
            version: { increment: 1 },
          },
        });
      }
      await tx.equipmentInspection.update({
        where: { id },
        data: {
          status: passed
            ? EquipmentInspectionStatus.PASSED
            : EquipmentInspectionStatus.FAILED,
          result: passed ? 'PASSED' : 'FAILED',
          summary: input.summary,
          completedAt: new Date(),
          completedByStaffUserId: actorId,
          version: { increment: 1 },
        },
      });
    });
    return this.inspection(actorId, id);
  }

  private async simpleTransition(
    actorId: string,
    id: string,
    input: OperationInput & object,
    options: {
      allowed: MaintenanceWorkOrderStatus[];
      next: MaintenanceWorkOrderStatus;
      type: MaintenanceOperationType;
      summary: string;
      timestamp?: 'startedAt' | 'readyForInspectionAt';
    },
  ) {
    return this.workOrderMutation(actorId, id, input, {
      permission: 'maintenance.update',
      type: options.type,
      allowed: options.allowed,
      summary: options.summary,
      apply: async () => ({
        status: options.next,
        ...(options.timestamp ? { [options.timestamp]: new Date() } : {}),
      }),
    });
  }

  private async workOrderMutation(
    actorId: string,
    id: string,
    input: OperationInput & object,
    options: {
      permission: string;
      type: MaintenanceOperationType;
      allowed: MaintenanceWorkOrderStatus[];
      summary: string;
      apply: (
        tx: Prisma.TransactionClient,
        row: Prisma.MaintenanceWorkOrderGetPayload<object>,
      ) => Promise<Prisma.MaintenanceWorkOrderUpdateInput>;
      metadata?: JsonObject;
    },
  ) {
    const payloadHash = this.hash({ action: options.type, id, ...input });
    await this.mutate(async (tx) => {
      const row = await this.lockAndLoadWorkOrder(tx, id);
      const replay = await this.authorizeAndReplay(
        tx,
        actorId,
        [options.permission],
        input.operationId,
        payloadHash,
        'workOrderId',
      );
      if (replay) return;
      this.requireWorkOrderVersion(row, input.expectedVersion);
      if (!options.allowed.includes(row.status))
        throw new ConflictException(
          'Work order cannot perform this action from its current state',
        );
      const data = await options.apply(tx, row);
      await tx.maintenanceOperation.create({
        data: {
          workOrderId: id,
          type: options.type,
          operationId: input.operationId,
          payloadHash,
          actorUserId: actorId,
          expectedVersion: input.expectedVersion,
          resultingVersion: input.expectedVersion + 1,
          summary: options.summary,
          metadata: options.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.maintenanceWorkOrder.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
    });
    return this.workOrder(actorId, id);
  }

  private async resolveWorkOrderSourceState(
    tx: Prisma.TransactionClient,
    input: WorkOrderCreateInput,
  ): Promise<InventoryState> {
    if (input.source === MaintenanceWorkOrderSource.RETURN_ISSUE) {
      const issue = await tx.rentalIssue.findUnique({
        where: { id: input.sourceRentalIssueId! },
        include: {
          inventoryItem: true,
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
        issue.status === RentalIssueStatus.RESOLVED ||
        issue.openQuantity < input.quantity
      )
        throw new UnprocessableEntityException(
          'Rental issue has insufficient unresolved quantity',
        );
      if (
        issue.type !== RentalIssueType.DAMAGED &&
        issue.type !== RentalIssueType.MAINTENANCE_REQUIRED
      )
        throw new UnprocessableEntityException(
          'Rental issue is not maintenance eligible',
        );
      const claimed = await tx.maintenanceWorkOrder.aggregate({
        where: {
          sourceRentalIssueId: issue.id,
          status: { in: ACTIVE_WORK_ORDER_STATUSES },
        },
        _sum: { quantity: true },
      });
      if (issue.openQuantity - (claimed._sum.quantity ?? 0) < input.quantity)
        throw new UnprocessableEntityException(
          'Rental issue quantity is already assigned to other maintenance work',
        );
      const inventoryId =
        issue.inventoryItem?.inventoryId ??
        issue.rentalReturnItem?.activeRentalItem.orderFulfilmentItem
          .reservationItem.inventoryId;
      if (
        inventoryId !== input.inventoryId ||
        (issue.inventoryItemId ?? null) !== (input.inventoryItemId ?? null)
      )
        throw new UnprocessableEntityException(
          'Rental issue target does not match inventory target',
        );
      return issue.type === RentalIssueType.DAMAGED
        ? InventoryState.DAMAGED
        : InventoryState.MAINTENANCE;
    }
    if (input.source === MaintenanceWorkOrderSource.FAILED_INSPECTION) {
      const inspection = await tx.equipmentInspection.findUnique({
        where: { id: input.sourceInspectionId! },
      });
      if (!inspection) throw new NotFoundException('Inspection not found');
      if (
        inspection.status !== EquipmentInspectionStatus.FAILED ||
        inspection.inventoryId !== input.inventoryId ||
        inspection.inventoryItemId !== (input.inventoryItemId ?? null) ||
        inspection.quantity !== input.quantity
      )
        throw new UnprocessableEntityException(
          'Failed inspection target does not match',
        );
      return InventoryState.MAINTENANCE;
    }
    if (input.source === MaintenanceWorkOrderSource.RETURN_DISPOSITION) {
      const returnItem = await tx.rentalReturnItem.findUnique({
        where: { id: input.sourceRentalReturnItemId! },
        include: {
          activeRentalItem: {
            include: {
              orderFulfilmentItem: { include: { reservationItem: true } },
              serializedAssets: {
                include: { returnedAsset: true },
              },
            },
          },
        },
      });
      if (!returnItem)
        throw new NotFoundException('Rental return item not found');
      const inventoryId =
        returnItem.activeRentalItem.orderFulfilmentItem.reservationItem
          .inventoryId;
      if (input.inventoryItemId) {
        const returnedAsset = returnItem.activeRentalItem.serializedAssets.find(
          ({ inventoryItemId }) => inventoryItemId === input.inventoryItemId,
        )?.returnedAsset;
        if (
          inventoryId !== input.inventoryId ||
          input.quantity !== 1 ||
          returnedAsset?.disposition !== 'MAINTENANCE'
        )
          throw new UnprocessableEntityException(
            'Serialized return disposition does not match the maintenance target',
          );
        return InventoryState.MAINTENANCE;
      }
      const claimed = await tx.maintenanceWorkOrder.aggregate({
        where: {
          sourceRentalReturnItemId: returnItem.id,
          inventoryItemId: null,
          status: { in: ACTIVE_WORK_ORDER_STATUSES },
        },
        _sum: { quantity: true },
      });
      if (
        inventoryId !== input.inventoryId ||
        returnItem.maintenanceQuantity - (claimed._sum.quantity ?? 0) <
          input.quantity
      )
        throw new UnprocessableEntityException(
          'Return disposition target does not match available maintenance equipment',
        );
      return InventoryState.MAINTENANCE;
    }
    if (!input.sourceState)
      throw new UnprocessableEntityException(
        'Manual maintenance requires an explicit source state',
      );
    return input.sourceState;
  }

  private async ensureTargetAvailable(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    inventoryItemId: string | null,
    quantity: number,
    sourceState: InventoryState,
  ) {
    if (inventoryItemId) {
      const item = await tx.inventoryItem.findUnique({
        where: { id: inventoryItemId },
      });
      if (!item || item.status !== sourceState)
        throw new ConflictException('Serialized asset state changed');
      const conflict = await tx.maintenanceWorkOrder.findFirst({
        where: {
          inventoryItemId,
          status: { in: ACTIVE_WORK_ORDER_STATUSES },
        },
      });
      if (conflict)
        throw new ConflictException(
          'Serialized asset already has active maintenance work',
        );
      const inspectionConflict = await tx.equipmentInspection.findFirst({
        where: {
          inventoryItemId,
          ingressMoved: true,
          status: {
            in: [
              EquipmentInspectionStatus.SCHEDULED,
              EquipmentInspectionStatus.IN_PROGRESS,
            ],
          },
        },
        select: { id: true },
      });
      if (inspectionConflict)
        throw new ConflictException(
          'Serialized asset is held by an active equipment inspection',
        );
      if (sourceState === InventoryState.RENTABLE) {
        const [allocation, prepared, checkedOut] = await Promise.all([
          tx.serializedAssetAllocation.findFirst({
            where: { inventoryItemId, status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.preparedSerializedAsset.findFirst({
            where: {
              serializedAllocation: {
                is: { inventoryItemId, status: 'ACTIVE' },
              },
            },
            select: { id: true },
          }),
          tx.activeRentalSerializedAsset.findFirst({
            where: { inventoryItemId, returnedAsset: { is: null } },
            select: { id: true },
          }),
        ]);
        // Prepared and active-rental rows are immutable history. Only a still-
        // active allocation or an asset without a recorded return is a current
        // commitment; completed historical rows must not block maintenance.
        if (allocation || prepared || checkedOut)
          throw new ConflictException(
            'Serialized asset is committed to a rental workflow',
          );
      }
      return;
    }
    const balance = await this.bulkBalance(tx, inventoryId, sourceState);
    if (sourceState !== InventoryState.MAINTENANCE) {
      if (balance < quantity)
        throw new UnprocessableEntityException(
          'Maintenance quantity exceeds source-state inventory',
        );
      if (sourceState === InventoryState.RENTABLE) {
        const commitments = await tx.inventoryReservationItem.aggregate({
          where: { inventoryId },
          _sum: { reservedQuantity: true },
        });
        if (balance - quantity < (commitments._sum.reservedQuantity ?? 0))
          throw new ConflictException(
            'Equipment is committed to an active rental reservation',
          );
      }
      return;
    }
    const [claims, inspectionClaims] = await Promise.all([
      tx.maintenanceWorkOrder.aggregate({
        where: {
          inventoryId,
          inventoryItemId: null,
          status: { in: ACTIVE_WORK_ORDER_STATUSES },
        },
        _sum: { quantity: true },
      }),
      tx.equipmentInspection.aggregate({
        where: {
          inventoryId,
          inventoryItemId: null,
          ingressMoved: true,
          status: {
            in: [
              EquipmentInspectionStatus.SCHEDULED,
              EquipmentInspectionStatus.IN_PROGRESS,
            ],
          },
        },
        _sum: { quantity: true },
      }),
    ]);
    if (
      balance -
        (claims._sum.quantity ?? 0) -
        (inspectionClaims._sum.quantity ?? 0) <
      quantity
    )
      throw new UnprocessableEntityException(
        'Maintenance quantity is already assigned to other work',
      );
  }

  private validateTarget(
    mode: InventoryTrackingMode,
    item:
      | { id: string; assetNumber: string; serialNumber: string | null }
      | null
      | undefined,
    quantity: number,
  ) {
    if (mode === InventoryTrackingMode.SERIALIZED && (!item || quantity !== 1))
      throw new UnprocessableEntityException(
        'Serialized maintenance requires one exact asset',
      );
    if (mode === InventoryTrackingMode.BULK && item)
      throw new UnprocessableEntityException(
        'Bulk maintenance cannot target a serialized asset',
      );
  }

  private async resolveLinkedIssue(
    tx: Prisma.TransactionClient,
    actorId: string,
    row: Prisma.MaintenanceWorkOrderGetPayload<object>,
    input: {
      operationId: string;
      completionOutcome: MaintenanceCompletionOutcome;
      completionSummary: string;
      expectedIssueVersion?: number;
      expectedReturnVersion?: number;
    },
  ) {
    if (!row.sourceRentalIssueId)
      throw new UnprocessableEntityException(
        'Work order has no linked rental issue',
      );
    if (
      input.completionOutcome !== MaintenanceCompletionOutcome.RETURN_TO_SERVICE
    )
      throw new UnprocessableEntityException(
        'Only returned-to-service work can resolve as repaired',
      );
    const issue = await tx.rentalIssue.findUnique({
      where: { id: row.sourceRentalIssueId },
      include: { rentalReturn: true },
    });
    if (!issue) throw new NotFoundException('Linked rental issue not found');
    if (
      issue.version !== input.expectedIssueVersion ||
      issue.rentalReturn.version !== input.expectedReturnVersion
    )
      throw new ConflictException(
        'Issue or return changed. Refresh and try again.',
      );
    if (
      issue.status === RentalIssueStatus.RESOLVED ||
      issue.openQuantity < row.quantity
    )
      throw new UnprocessableEntityException(
        'Linked issue cannot be resolved by this work order',
      );
    const resultingOpen = issue.openQuantity - row.quantity;
    const resolution = await tx.rentalIssueResolution.create({
      data: {
        rentalIssueId: issue.id,
        operationId: this.derivedUuid(input.operationId, 'issue-resolution'),
        payloadHash: this.hash({ workOrderId: row.id, quantity: row.quantity }),
        expectedVersion: issue.version,
        resultingVersion: issue.version + 1,
        actorUserId: actorId,
        quantity: row.quantity,
        outcome: RentalIssueResolutionOutcome.REPAIRED,
        resultingInventoryState: InventoryState.RENTABLE,
        internalReason: input.completionSummary,
      },
    });
    await tx.rentalIssue.update({
      where: { id: issue.id },
      data: {
        openQuantity: resultingOpen,
        status: resultingOpen === 0 ? RentalIssueStatus.RESOLVED : issue.status,
        version: { increment: 1 },
      },
    });
    await tx.rentalReturn.update({
      where: { id: issue.rentalReturnId },
      data: { updatedByUserId: actorId, version: { increment: 1 } },
    });
    await tx.returnActivity.create({
      data: {
        rentalReturnId: issue.rentalReturnId,
        actorUserId: actorId,
        type: ReturnActivityType.ISSUE_RESOLVED,
        summary:
          'Linked issue explicitly resolved as repaired after maintenance.',
        metadata: { issueId: issue.id, workOrderId: row.id },
      },
    });
    return resolution.id;
  }

  private async moveInventory(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      inventoryId: string;
      inventoryItemId: string | null;
      quantity: number;
      fromState: InventoryState;
      toState: InventoryState;
      action: InventoryTransactionAction;
      operationId: string;
      maintenanceOperationId: string;
      issueResolutionId?: string | null;
      reason: string;
    },
  ) {
    if (input.fromState === input.toState)
      throw new UnprocessableEntityException(
        'Inventory transition must change state',
      );
    if (input.inventoryItemId) {
      const updated = await tx.inventoryItem.updateMany({
        where: {
          id: input.inventoryItemId,
          inventoryId: input.inventoryId,
          status: input.fromState,
        },
        data: { status: input.toState },
      });
      if (updated.count !== 1)
        throw new ConflictException('Serialized asset state changed');
    } else {
      const balance = await this.bulkBalance(
        tx,
        input.inventoryId,
        input.fromState,
      );
      if (balance < input.quantity)
        throw new ConflictException(
          'Inventory state changed. Refresh and try again.',
        );
    }
    await tx.inventoryTransaction.create({
      data: {
        inventoryId: input.inventoryId,
        inventoryItemId: input.inventoryItemId,
        actorUserId: input.actorId,
        operationId: input.operationId,
        maintenanceOperationId: input.maintenanceOperationId,
        issueResolutionId: input.issueResolutionId ?? null,
        kind: input.inventoryItemId
          ? InventoryTransactionKind.SERIALIZED_ITEM_STATE_CHANGED
          : InventoryTransactionKind.BULK_MOVEMENT,
        action: input.action,
        quantity: input.quantity,
        fromState: input.fromState,
        toState: input.toState,
        reason: input.reason,
      },
    });
    await tx.inventory.update({
      where: { id: input.inventoryId },
      data: { updatedAt: new Date() },
    });
  }

  private async currentState(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    inventoryItemId: string | null,
  ) {
    if (inventoryItemId) {
      const item = await tx.inventoryItem.findFirst({
        where: { id: inventoryItemId, inventoryId },
      });
      if (!item) throw new NotFoundException('Serialized asset not found');
      return item.status;
    }
    for (const state of [
      InventoryState.RENTABLE,
      InventoryState.DAMAGED,
      InventoryState.MAINTENANCE,
    ])
      if ((await this.bulkBalance(tx, inventoryId, state)) > 0) return state;
    throw new UnprocessableEntityException(
      'Inventory has no maintenance-eligible quantity',
    );
  }

  private async bulkBalance(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    state: InventoryState,
  ) {
    const [incoming, outgoing] = await Promise.all([
      tx.inventoryTransaction.aggregate({
        where: { inventoryId, toState: state },
        _sum: { quantity: true },
      }),
      tx.inventoryTransaction.aggregate({
        where: { inventoryId, fromState: state },
        _sum: { quantity: true },
      }),
    ]);
    return (incoming._sum.quantity ?? 0) - (outgoing._sum.quantity ?? 0);
  }

  private async authorizeAndReplay(
    tx: Prisma.TransactionClient,
    actorId: string,
    permissions: string[],
    operationId: string,
    payloadHash: string,
    target: 'workOrderId' | 'inspectionId',
  ) {
    await this.requireActor(tx, actorId, permissions);
    const replay = await tx.maintenanceOperation.findUnique({
      where: { operationId },
    });
    if (!replay) return null;
    if (
      replay.actorUserId !== actorId ||
      replay.payloadHash !== payloadHash ||
      !replay[target]
    )
      throw new ConflictException('Operation ID was already used differently');
    return replay[target];
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
    if (!actor) throw new ForbiddenException('Staff account is not active');
    const keys = new Set(
      actor.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key),
      ),
    );
    if (required.some((key) => !keys.has(key)))
      throw new ForbiddenException('Insufficient permissions');
  }

  private async requireActiveAssignee(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const user = await tx.user.findFirst({
      where: {
        id,
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            role: {
              permissions: {
                some: { permission: { key: 'maintenance.update' } },
              },
            },
          },
        },
      },
    });
    if (!user)
      throw new UnprocessableEntityException(
        'Assigned staff member is not active and eligible',
      );
  }

  private async lockInventory(tx: Prisma.TransactionClient, id: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
  }

  private async lockWorkOrder(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MaintenanceWorkOrder" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundException('Maintenance work order not found');
  }

  private async lockAndLoadWorkOrder(tx: Prisma.TransactionClient, id: string) {
    await this.lockWorkOrder(tx, id);
    const row = await tx.maintenanceWorkOrder.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Maintenance work order not found');
    await this.lockInventory(tx, row.inventoryId);
    return row;
  }

  private async lockAndLoadInspection(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "EquipmentInspection" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundException('Equipment inspection not found');
    const row = await tx.equipmentInspection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Equipment inspection not found');
    await this.lockInventory(tx, row.inventoryId);
    return row;
  }

  private requireWorkOrderVersion(
    row: Prisma.MaintenanceWorkOrderGetPayload<object> | null,
    expected: number,
  ) {
    if (!row) throw new NotFoundException('Maintenance work order not found');
    if (row.version !== expected)
      throw new ConflictException('Work order changed. Refresh and try again.');
  }

  private requireInspectionVersion(
    row: Prisma.EquipmentInspectionGetPayload<object> | null,
    expected: number,
  ) {
    if (!row) throw new NotFoundException('Equipment inspection not found');
    if (row.version !== expected)
      throw new ConflictException('Inspection changed. Refresh and try again.');
  }

  private async loadWorkOrder(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.maintenanceWorkOrder.findUnique({
      where: { id },
      include: workOrderInclude,
    });
    if (!row) throw new NotFoundException('Maintenance work order not found');
    return this.mapWorkOrder(row);
  }

  private async loadInspection(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.equipmentInspection.findUnique({
      where: { id },
      include: inspectionInclude,
    });
    if (!row) throw new NotFoundException('Equipment inspection not found');
    return this.mapInspection(row);
  }

  private mapWorkOrder(row: WorkOrderRecord) {
    return {
      id: row.id,
      workOrderNumber: row.workOrderNumber,
      source: row.source,
      type: row.type,
      status: row.status,
      priority: row.priority,
      title: row.title,
      description: row.description,
      inventoryId: row.inventoryId,
      inventoryItemId: row.inventoryItemId,
      quantity: row.quantity,
      productName: row.productNameSnapshot,
      assetNumber: row.assetNumberSnapshot,
      serialNumber: row.serialNumberSnapshot,
      sourceRentalReturnItemId: row.sourceRentalReturnItemId,
      sourceRentalIssueId: row.sourceRentalIssueId,
      sourceInspectionId: row.sourceInspectionId,
      assignedStaff: row.assignedStaff
        ? {
            id: row.assignedStaff.id,
            firstName: row.assignedStaff.firstName,
            lastName: row.assignedStaff.lastName,
            status: row.assignedStaff.status,
          }
        : null,
      createdBy: row.createdBy,
      completedBy: row.completedBy,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
      overdue:
        Boolean(row.dueAt && row.dueAt < new Date()) &&
        ACTIVE_WORK_ORDER_STATUSES.includes(row.status),
      startedAt: row.startedAt?.toISOString() ?? null,
      readyForInspectionAt: row.readyForInspectionAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancellationReason: row.cancellationReason,
      completionSummary: row.completionSummary,
      completionOutcome: row.completionOutcome,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      notes: row.notes.map((note) => ({
        id: note.id,
        body: note.body,
        author: note.author,
        createdAt: note.createdAt.toISOString(),
      })),
      operations: row.operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        summary: operation.summary,
        actor: operation.actor,
        createdAt: operation.createdAt.toISOString(),
      })),
      inspections: row.inspections.map((inspection) => ({
        id: inspection.id,
        inspectionNumber: inspection.inspectionNumber,
        type: inspection.type,
        status: inspection.status,
        result: inspection.result,
        inventoryId: inspection.inventoryId,
        inventoryItemId: inspection.inventoryItemId,
        quantity: inspection.quantity,
        productName: inspection.productNameSnapshot,
        assetNumber: inspection.assetNumberSnapshot,
        scheduledFor: inspection.scheduledFor.toISOString(),
        sourceWorkOrderId: inspection.sourceWorkOrderId,
        completedAt: inspection.completedAt?.toISOString() ?? null,
        createdAt: inspection.createdAt.toISOString(),
        updatedAt: inspection.updatedAt.toISOString(),
        version: inspection.version,
        overdue:
          inspection.scheduledFor < new Date() &&
          ACTIVE_INSPECTION_STATUSES.includes(inspection.status),
        assignedStaff: inspection.assignedStaff,
      })),
      notice:
        'Internal maintenance information. Never expose this response publicly.',
    };
  }

  private mapInspection(row: InspectionRecord) {
    return {
      id: row.id,
      inspectionNumber: row.inspectionNumber,
      type: row.type,
      status: row.status,
      result: row.result,
      inventoryId: row.inventoryId,
      inventoryItemId: row.inventoryItemId,
      quantity: row.quantity,
      productName: row.productNameSnapshot,
      assetNumber: row.assetNumberSnapshot,
      serialNumber: row.serialNumberSnapshot,
      sourceWorkOrderId: row.sourceWorkOrderId,
      generatedWorkOrderId: row.generatedWorkOrder?.id ?? null,
      ingressMoved: row.ingressMoved,
      assignedStaff: row.assignedStaff,
      createdBy: row.createdBy,
      completedBy: row.completedBy,
      scheduledFor: row.scheduledFor.toISOString(),
      overdue:
        row.scheduledFor < new Date() &&
        ACTIVE_INSPECTION_STATUSES.includes(row.status),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      summary: row.summary,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      operations: row.operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        summary: operation.summary,
        actor: operation.actor,
        createdAt: operation.createdAt.toISOString(),
      })),
      notice:
        'Internal inspection information. Never expose this response publicly.',
    };
  }

  private page<T>(
    items: T[],
    query: { page: number; pageSize: number },
    total: number,
  ) {
    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    kind: 'workOrder' | 'inspection',
  ) {
    const prefix = kind === 'workOrder' ? 'MWO' : 'INS';
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = `${prefix}-${year}-${randomInt(0, 1_000_000).toString().padStart(6, '0')}`;
      const exists =
        kind === 'workOrder'
          ? await tx.maintenanceWorkOrder.findUnique({
              where: { workOrderNumber: candidate },
            })
          : await tx.equipmentInspection.findUnique({
              where: { inspectionNumber: candidate },
            });
      if (!exists) return candidate;
    }
    throw new ConflictException(
      'Could not allocate a maintenance reference number',
    );
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

  private async mutate<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
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
            'Maintenance state changed. Refresh and try again.',
          );
        throw error;
      }
    }
    throw new ConflictException(
      'Maintenance state changed. Refresh and try again.',
    );
  }
}
