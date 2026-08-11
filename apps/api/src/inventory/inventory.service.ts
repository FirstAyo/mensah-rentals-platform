import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryState,
  InventoryTrackingMode,
  InventoryTransactionAction,
  InventoryTransactionKind,
  Prisma,
  UserStatus,
  prisma,
} from '@mensah-rentals/database';
import type {
  AdminInventoryItemResponse,
  AdminInventoryLifecycleResponse,
  AdminInventoryMetadataResponse,
  AdminInventoryQuantityResponse,
  AdminInventoryTransactionResponse,
  InventoryStateResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import type {
  BulkInventoryMovementInput,
  AddInventoryStockInput,
  CreateInventoryInput,
  CreateInventoryItemInput,
  InventoryListQuery,
  InventoryPageQuery,
  InventoryLifecycleActionInput,
  ReduceInventoryStockInput,
  TransitionInventoryItemInput,
  UpdateInventoryMetadataInput,
} from '@mensah-rentals/validation';

const STATES = Object.values(InventoryState);
const SAFE_INITIAL_STATES = new Set<InventoryState>([
  InventoryState.RENTABLE,
  InventoryState.MAINTENANCE,
  InventoryState.DAMAGED,
]);
const INVENTORY_CREATION_LOCK = 2_026_072_313;
const metadataSelect = {
  id: true,
  trackingMode: true,
  internalNotes: true,
  isActive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.InventorySelect;

type SelectedMetadata = Prisma.InventoryGetPayload<{
  select: typeof metadataSelect;
}>;

@Injectable()
export class InventoryService {
  async list(
    query: InventoryListQuery,
  ): Promise<PaginatedResponse<AdminInventoryMetadataResponse>> {
    const where: Prisma.InventoryWhereInput = {
      ...(query.lifecycle === 'ACTIVE'
        ? { isActive: true }
        : query.lifecycle === 'ARCHIVED'
          ? { isActive: false }
          : {}),
      ...(query.trackingMode ? { trackingMode: query.trackingMode } : {}),
      ...(query.search
        ? { product: { name: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };
    const primary =
      query.sortBy === 'productName'
        ? { product: { name: query.sortDirection } }
        : { [query.sortBy]: query.sortDirection };
    const [total, items] = await prisma.$transaction([
      prisma.inventory.count({ where }),
      prisma.inventory.findMany({
        where,
        select: metadataSelect,
        orderBy: [
          primary as Prisma.InventoryOrderByWithRelationInput,
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return this.page(items.map(this.mapMetadata), query, total);
  }

  async get(id: string) {
    const inventory = await prisma.inventory.findUnique({
      where: { id },
      select: metadataSelect,
    });
    if (!inventory) throw new NotFoundException('Inventory not found');
    return this.mapMetadata(inventory);
  }

  async updateMetadata(
    actorId: string,
    inventoryId: string,
    input: UpdateInventoryMetadataInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.adjust',
      ]);
      const hash = this.payloadHash(input);
      await this.lockAdminOperation(tx, input.operationId);
      if (
        await this.replayAudit(
          tx,
          input.operationId,
          inventoryId,
          hash,
          'INVENTORY_UPDATED',
        )
      )
        return;
      await this.lockInventory(tx, inventoryId);
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
        include: { product: { select: { name: true } } },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { internalNotes: input.internalNotes },
      });
      await this.audit(tx, {
        action: 'INVENTORY_UPDATED',
        actorId,
        inventoryId,
        operationId: input.operationId,
        payloadHash: hash,
        productName: inventory.product.name,
        summary: `Inventory metadata updated for ${inventory.product.name}`,
        metadata: {
          beforeInternalNotes: inventory.internalNotes,
          afterInternalNotes: input.internalNotes,
        },
      });
    });
    return this.get(inventoryId);
  }

  async addStock(
    actorId: string,
    inventoryId: string,
    input: AddInventoryStockInput,
  ) {
    await this.changeOwnedBulkStock(actorId, inventoryId, input, true);
    return this.quantities(inventoryId);
  }

  async reduceStock(
    actorId: string,
    inventoryId: string,
    input: ReduceInventoryStockInput,
  ) {
    try {
      await this.changeOwnedBulkStock(actorId, inventoryId, input, false);
    } catch (error) {
      if (
        error instanceof Error &&
        /invalidate active date-range reservations/i.test(error.message)
      )
        throw new ConflictException({
          code: 'ACTIVE_RESERVATION_BLOCKS_REDUCTION',
          message:
            'This stock is committed to an active reservation and cannot be retired.',
        });
      throw error;
    }
    return this.quantities(inventoryId);
  }

  async lifecycle(
    inventoryId: string,
  ): Promise<AdminInventoryLifecycleResponse> {
    return prisma.$transaction(async (tx) =>
      this.lifecycleWithinTransaction(tx, inventoryId),
    );
  }

  async archive(
    actorId: string,
    inventoryId: string,
    input: InventoryLifecycleActionInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.adjust',
      ]);
      const hash = this.payloadHash(input);
      await this.lockAdminOperation(tx, input.operationId);
      if (
        await this.replayAudit(
          tx,
          input.operationId,
          inventoryId,
          hash,
          'INVENTORY_ARCHIVED',
        )
      )
        return;
      await this.lockInventory(tx, inventoryId);
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
        include: { product: { select: { name: true } } },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      if (!inventory.isActive) return;
      const lifecycle = await this.lifecycleWithinTransaction(tx, inventoryId);
      if (!lifecycle.canArchive)
        throw new ConflictException({
          code: 'INVENTORY_ARCHIVE_BLOCKED',
          message:
            'Inventory cannot be archived while stock or commitments remain.',
          blockers: lifecycle.archiveBlockers,
        });
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { isActive: false, archivedAt: new Date() },
      });
      await this.audit(tx, {
        action: 'INVENTORY_ARCHIVED',
        actorId,
        inventoryId,
        operationId: input.operationId,
        payloadHash: hash,
        productName: inventory.product.name,
        summary: `Inventory archived for ${inventory.product.name}`,
        metadata: { reason: input.reason },
      });
    });
    return this.get(inventoryId);
  }

  async restore(
    actorId: string,
    inventoryId: string,
    input: InventoryLifecycleActionInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.adjust',
      ]);
      const hash = this.payloadHash(input);
      await this.lockAdminOperation(tx, input.operationId);
      if (
        await this.replayAudit(
          tx,
          input.operationId,
          inventoryId,
          hash,
          'INVENTORY_RESTORED',
        )
      )
        return;
      await this.lockInventory(tx, inventoryId);
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
        include: { product: { select: { name: true } } },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      if (inventory.isActive) return;
      const lifecycle = await this.lifecycleWithinTransaction(tx, inventoryId);
      if (!lifecycle.canRestore)
        throw new ConflictException({
          code: 'INVENTORY_RESTORE_BLOCKED',
          message: 'Inventory cannot be restored until its product is active.',
          blockers: lifecycle.restoreBlockers,
        });
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { isActive: true, archivedAt: null },
      });
      await this.audit(tx, {
        action: 'INVENTORY_RESTORED',
        actorId,
        inventoryId,
        operationId: input.operationId,
        payloadHash: hash,
        productName: inventory.product.name,
        summary: `Inventory restored for ${inventory.product.name}`,
        metadata: { reason: input.reason },
      });
    });
    return this.get(inventoryId);
  }

  async delete(
    actorId: string,
    inventoryId: string,
    input: InventoryLifecycleActionInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.adjust',
      ]);
      const hash = this.payloadHash(input);
      await this.lockAdminOperation(tx, input.operationId);
      if (
        await this.replayAudit(
          tx,
          input.operationId,
          inventoryId,
          hash,
          'INVENTORY_DELETED',
        )
      )
        return;
      await this.lockInventory(tx, inventoryId);
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
        include: { product: { select: { id: true, name: true, slug: true } } },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      const lifecycle = await this.lifecycleWithinTransaction(tx, inventoryId);
      if (!lifecycle.canHardDelete)
        throw new ConflictException({
          code: 'INVENTORY_HAS_HISTORY',
          message:
            'Inventory has stock or history and cannot be permanently deleted.',
          canArchive: lifecycle.canArchive,
          blockers: lifecycle.hardDeleteBlockers,
        });
      await tx.inventory.delete({ where: { id: inventoryId } });
      await this.audit(tx, {
        action: 'INVENTORY_DELETED',
        actorId,
        inventoryId,
        operationId: input.operationId,
        payloadHash: hash,
        productName: inventory.product.name,
        summary: `Unused inventory permanently deleted for ${inventory.product.name}`,
        metadata: {
          reason: input.reason,
          productId: inventory.product.id,
          productSlug: inventory.product.slug,
          trackingMode: inventory.trackingMode,
        },
      });
    });
    return { action: 'DELETED' as const, inventoryId };
  }

  async create(actorId: string, input: CreateInventoryInput) {
    if (!SAFE_INITIAL_STATES.has(input.initialState as InventoryState))
      throw new ConflictException(
        'New inventory can only start as rentable, maintenance, or damaged',
      );
    const id = await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.adjust',
      ]);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INVENTORY_CREATION_LOCK})`;
      const existingInventory = await tx.inventory.findUnique({
        where: { creationOperationId: input.operationId },
        include: {
          transactions: {
            where: { operationId: input.operationId },
            take: 1,
          },
        },
      });
      if (existingInventory) {
        const initial = existingInventory.transactions[0];
        const matches =
          existingInventory.productId === input.productId &&
          existingInventory.trackingMode === input.trackingMode &&
          existingInventory.creationReason === input.reason &&
          existingInventory.initialState === input.initialState &&
          (input.trackingMode === InventoryTrackingMode.SERIALIZED ||
            (initial?.kind === InventoryTransactionKind.INITIAL_STOCK &&
              initial.quantity === input.initialQuantity &&
              initial.toState === input.initialState &&
              initial.reason === input.reason));
        if (matches) return existingInventory.id;
        throw new ConflictException(
          'Operation ID was already used differently',
        );
      }
      const product = await tx.product.findUnique({
        where: { id: input.productId },
      });
      if (!product) throw new NotFoundException('Product not found');
      if (!product.isActive || product.deletedAt)
        throw new ConflictException('Inventory requires an active product');
      if (
        await tx.inventory.findUnique({ where: { productId: input.productId } })
      )
        throw new ConflictException('This product already has inventory');
      const inventory = await tx.inventory.create({
        data: {
          productId: input.productId,
          creationOperationId: input.operationId,
          creationReason: input.reason,
          initialState: input.initialState,
          trackingMode: input.trackingMode,
        },
      });
      if (input.trackingMode === InventoryTrackingMode.BULK)
        await tx.inventoryTransaction.create({
          data: {
            inventoryId: inventory.id,
            actorUserId: actorId,
            operationId: input.operationId,
            kind: InventoryTransactionKind.INITIAL_STOCK,
            action: InventoryTransactionAction.INITIAL_STOCK,
            quantity: input.initialQuantity!,
            toState: input.initialState,
            reason: input.reason,
          },
        });
      return inventory.id;
    });
    return this.get(id);
  }

  async quantities(id: string): Promise<AdminInventoryQuantityResponse> {
    const inventory = await prisma.inventory.findUnique({ where: { id } });
    if (!inventory) throw new NotFoundException('Inventory not found');
    const states = Object.fromEntries(
      STATES.map((state) => [state, 0]),
    ) as Record<InventoryStateResponse, number>;
    if (inventory.trackingMode === InventoryTrackingMode.SERIALIZED) {
      const groups = await prisma.inventoryItem.groupBy({
        by: ['status'],
        where: { inventoryId: id },
        _count: { _all: true },
      });
      for (const group of groups) states[group.status] = group._count._all;
    } else {
      const transactions = await prisma.inventoryTransaction.findMany({
        where: { inventoryId: id },
        select: { fromState: true, toState: true, quantity: true },
      });
      for (const transaction of transactions) {
        if (transaction.fromState)
          states[transaction.fromState] -= transaction.quantity;
        if (transaction.toState)
          states[transaction.toState] += transaction.quantity;
      }
    }
    const activeCommitment = await prisma.inventoryReservationItem.aggregate({
      where: { inventoryId: id, reservedQuantity: { gt: 0 } },
      _sum: { reservedQuantity: true },
    });
    return {
      inventoryId: id,
      reservedCommitmentQuantity: activeCommitment._sum.reservedQuantity ?? 0,
      states,
      totalQuantity: Object.values(states).reduce(
        (total, value) => total + value,
        0,
      ),
    };
  }

  async moveBulk(
    actorId: string,
    inventoryId: string,
    input: BulkInventoryMovementInput,
  ) {
    if (
      input.fromState !== InventoryState.RENTABLE ||
      input.toState !== InventoryState.DAMAGED
    )
      throw new ConflictException(
        'Manual bulk condition changes are limited to marking rentable stock as damaged; use dedicated workflows for all other states',
      );
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.adjust',
      ]);
      await tx.$executeRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${inventoryId} FOR UPDATE`;
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      if (!inventory.isActive)
        throw new ConflictException('Archived inventory cannot be adjusted');
      if (inventory.trackingMode !== InventoryTrackingMode.BULK)
        throw new ConflictException('Bulk movement requires BULK inventory');
      const previous = await tx.inventoryTransaction.findUnique({
        where: { operationId: input.operationId },
      });
      if (previous) {
        if (
          previous.inventoryId === inventoryId &&
          previous.kind === InventoryTransactionKind.BULK_MOVEMENT &&
          previous.fromState === input.fromState &&
          previous.toState === input.toState &&
          previous.quantity === input.quantity &&
          previous.reason === input.reason
        )
          return;
        throw new ConflictException(
          'Operation ID was already used differently',
        );
      }
      const source = await this.bulkBalance(tx, inventoryId, input.fromState);
      if (source < input.quantity)
        throw new ConflictException(
          'Movement exceeds the source-state quantity',
        );
      await tx.inventoryTransaction.create({
        data: {
          inventoryId,
          actorUserId: actorId,
          operationId: input.operationId,
          kind: InventoryTransactionKind.BULK_MOVEMENT,
          action: InventoryTransactionAction.MANUAL_ADJUSTMENT,
          quantity: input.quantity,
          fromState: input.fromState,
          toState: input.toState,
          reason: input.reason,
        },
      });
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { updatedAt: new Date() },
      });
    });
    return this.quantities(inventoryId);
  }

  async listItems(inventoryId: string, query: InventoryPageQuery) {
    await this.requireMode(inventoryId, InventoryTrackingMode.SERIALIZED);
    const where = { inventoryId };
    const [total, items] = await prisma.$transaction([
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where,
        orderBy: [{ assetNumber: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return this.page(
      items.map(
        (item): AdminInventoryItemResponse => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }),
      ),
      query,
      total,
    );
  }

  async createItem(
    actorId: string,
    inventoryId: string,
    input: CreateInventoryItemInput,
  ): Promise<AdminInventoryItemResponse> {
    if (!SAFE_INITIAL_STATES.has(input.initialState as InventoryState))
      throw new ConflictException(
        'New assets can only start as rentable, maintenance, or damaged',
      );
    const itemId = await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.adjust',
      ]);
      await tx.$executeRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${inventoryId} FOR UPDATE`;
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      if (!inventory.isActive)
        throw new ConflictException('Archived inventory cannot receive assets');
      if (inventory.trackingMode !== InventoryTrackingMode.SERIALIZED)
        throw new ConflictException(
          'Individual assets require SERIALIZED inventory',
        );
      const previous = await tx.inventoryTransaction.findUnique({
        where: { operationId: input.operationId },
      });
      if (previous?.inventoryItemId) {
        const existingItem = await tx.inventoryItem.findUnique({
          where: { id: previous.inventoryItemId },
        });
        if (
          existingItem &&
          previous.inventoryId === inventoryId &&
          previous.kind === InventoryTransactionKind.SERIALIZED_ITEM_CREATED &&
          previous.toState === input.initialState &&
          previous.reason === input.reason &&
          existingItem.assetNumber === input.assetNumber.trim().toUpperCase() &&
          existingItem.serialNumber === (input.serialNumber ?? null)
        )
          return previous.inventoryItemId;
      }
      if (previous)
        throw new ConflictException(
          'Operation ID was already used differently',
        );
      await tx.$queryRaw`
        SELECT 1 AS "locked"
        FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-asset:${input.assetNumber}`}, 0))) AS operation_lock`;
      const duplicateAsset = await tx.inventoryItem.findUnique({
        where: { assetNumber: input.assetNumber },
        select: { id: true },
      });
      if (duplicateAsset)
        throw new ConflictException('Asset number already exists');
      const item = await tx.inventoryItem.create({
        data: {
          inventoryId,
          assetNumber: input.assetNumber.trim().toUpperCase(),
          serialNumber: input.serialNumber ?? null,
          status: input.initialState,
        },
      });
      await tx.inventoryTransaction.create({
        data: {
          inventoryId,
          inventoryItemId: item.id,
          actorUserId: actorId,
          operationId: input.operationId,
          kind: InventoryTransactionKind.SERIALIZED_ITEM_CREATED,
          action: InventoryTransactionAction.ASSET_CREATED,
          quantity: 1,
          toState: input.initialState,
          reason: input.reason,
        },
      });
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { updatedAt: new Date() },
      });
      return item.id;
    });
    return this.getItem(inventoryId, itemId);
  }

  async transitionItem(
    actorId: string,
    inventoryId: string,
    itemId: string,
    input: TransitionInventoryItemInput,
  ): Promise<AdminInventoryItemResponse> {
    if (input.toState !== InventoryState.DAMAGED)
      throw new ConflictException(
        'Manual asset condition changes are limited to marking rentable assets as damaged; use dedicated workflows for all other states',
      );
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.adjust',
      ]);
      await tx.$executeRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${inventoryId} FOR UPDATE`;
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      if (!inventory.isActive)
        throw new ConflictException('Archived inventory cannot be adjusted');
      if (inventory.trackingMode !== InventoryTrackingMode.SERIALIZED)
        throw new ConflictException(
          'Individual asset changes require SERIALIZED inventory',
        );
      const previous = await tx.inventoryTransaction.findUnique({
        where: { operationId: input.operationId },
      });
      if (previous) {
        if (
          previous.inventoryId === inventoryId &&
          previous.inventoryItemId === itemId &&
          previous.kind ===
            InventoryTransactionKind.SERIALIZED_ITEM_STATE_CHANGED &&
          previous.toState === input.toState &&
          previous.reason === input.reason
        )
          return;
        throw new ConflictException(
          'Operation ID was already used differently',
        );
      }
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, inventoryId },
      });
      if (!item) throw new NotFoundException('Inventory item not found');
      if (item.status !== InventoryState.RENTABLE)
        throw new ConflictException(
          'Only rentable assets can be manually marked damaged; use the dedicated workflow for this asset state',
        );
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { status: input.toState },
      });
      await tx.inventoryTransaction.create({
        data: {
          inventoryId,
          inventoryItemId: itemId,
          actorUserId: actorId,
          operationId: input.operationId,
          kind: InventoryTransactionKind.SERIALIZED_ITEM_STATE_CHANGED,
          action: InventoryTransactionAction.MANUAL_ADJUSTMENT,
          quantity: 1,
          fromState: item.status,
          toState: input.toState,
          reason: input.reason,
        },
      });
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { updatedAt: new Date() },
      });
    });
    return this.getItem(inventoryId, itemId);
  }

  async transactions(inventoryId: string, query: InventoryPageQuery) {
    await this.get(inventoryId);
    const where = { inventoryId };
    const [total, items] = await prisma.$transaction([
      prisma.inventoryTransaction.count({ where }),
      prisma.inventoryTransaction.findMany({
        where,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return this.page(
      items.map(
        (item): AdminInventoryTransactionResponse => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        }),
      ),
      query,
      total,
    );
  }

  private async changeOwnedBulkStock(
    actorId: string,
    inventoryId: string,
    input: AddInventoryStockInput | ReduceInventoryStockInput,
    addition: boolean,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.adjust',
      ]);
      await this.lockInventory(tx, inventoryId);
      const inventory = await tx.inventory.findUnique({
        where: { id: inventoryId },
        include: { product: { select: { name: true } } },
      });
      if (!inventory) throw new NotFoundException('Inventory not found');
      if (!inventory.isActive)
        throw new ConflictException('Archived inventory cannot be adjusted');
      if (inventory.trackingMode !== InventoryTrackingMode.BULK)
        throw new ConflictException(
          'Owned quantity operations require BULK inventory',
        );
      const expectedKind = addition
        ? InventoryTransactionKind.STOCK_ADDITION
        : InventoryTransactionKind.STOCK_REDUCTION;
      const previous = await tx.inventoryTransaction.findUnique({
        where: { operationId: input.operationId },
      });
      if (previous) {
        if (
          previous.inventoryId === inventoryId &&
          previous.kind === expectedKind &&
          previous.quantity === input.quantity &&
          previous.reason === input.reason &&
          previous.reasonType === input.reasonType &&
          previous.reference === (input.reference ?? null)
        )
          return;
        throw new ConflictException(
          'Operation ID was already used differently',
        );
      }
      const rentableBefore = await this.bulkBalance(
        tx,
        inventoryId,
        InventoryState.RENTABLE,
      );
      if (!addition && rentableBefore < input.quantity)
        throw new ConflictException({
          code: 'INSUFFICIENT_RENTABLE_STOCK',
          message:
            'The reduction exceeds uncommitted rentable stock. Resolve reservations or equipment state first.',
        });
      const totalBefore = await this.physicalTotal(tx, inventory);
      await tx.inventoryTransaction.create({
        data: {
          inventoryId,
          actorUserId: actorId,
          operationId: input.operationId,
          kind: expectedKind,
          action: addition
            ? InventoryTransactionAction.STOCK_ADDED
            : InventoryTransactionAction.STOCK_REDUCED,
          quantity: input.quantity,
          fromState: addition ? null : InventoryState.RENTABLE,
          toState: addition ? InventoryState.RENTABLE : null,
          reason: input.reason,
          reasonType: input.reasonType,
          reference: input.reference ?? null,
        },
      });
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { updatedAt: new Date() },
      });
      const hash = this.payloadHash(input);
      await this.audit(tx, {
        action: addition ? 'STOCK_ADDED' : 'STOCK_REDUCED',
        actorId,
        inventoryId,
        operationId: input.operationId,
        payloadHash: hash,
        productName: inventory.product.name,
        summary: `${addition ? 'Stock added to' : 'Stock reduced for'} ${inventory.product.name}`,
        metadata: {
          quantityDelta: addition ? input.quantity : -input.quantity,
          physicalTotalBefore: totalBefore,
          physicalTotalAfter:
            totalBefore + (addition ? input.quantity : -input.quantity),
          reason: input.reason,
          reasonType: input.reasonType,
          reference: input.reference ?? null,
        },
      });
    });
  }

  private async lifecycleWithinTransaction(
    tx: Prisma.TransactionClient,
    inventoryId: string,
  ): Promise<AdminInventoryLifecycleResponse> {
    const inventory = await tx.inventory.findUnique({
      where: { id: inventoryId },
      include: { product: { select: { isActive: true, deletedAt: true } } },
    });
    if (!inventory) throw new NotFoundException('Inventory not found');
    const [
      transactionCount,
      itemCount,
      reservationCount,
      maintenanceCount,
      inspectionCount,
      activeReservationCount,
      activeMaintenanceCount,
      activeInspectionCount,
    ] = await Promise.all([
      tx.inventoryTransaction.count({ where: { inventoryId } }),
      tx.inventoryItem.count({ where: { inventoryId } }),
      tx.inventoryReservationItem.count({ where: { inventoryId } }),
      tx.maintenanceWorkOrder.count({ where: { inventoryId } }),
      tx.equipmentInspection.count({ where: { inventoryId } }),
      tx.inventoryReservationItem.count({
        where: {
          inventoryId,
          reservedQuantity: { gt: 0 },
        },
      }),
      tx.maintenanceWorkOrder.count({
        where: {
          inventoryId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      tx.equipmentInspection.count({
        where: {
          inventoryId,
          status: { notIn: ['PASSED', 'FAILED', 'CANCELLED'] },
        },
      }),
    ]);
    const total = await this.physicalTotal(tx, inventory);
    const hardDeleteBlockers: string[] = [];
    if (total !== 0) hardDeleteBlockers.push('PHYSICAL_STOCK');
    if (transactionCount) hardDeleteBlockers.push('TRANSACTION_HISTORY');
    if (itemCount) hardDeleteBlockers.push('SERIALIZED_ASSETS');
    if (reservationCount) hardDeleteBlockers.push('RESERVATION_HISTORY');
    if (maintenanceCount) hardDeleteBlockers.push('MAINTENANCE_HISTORY');
    if (inspectionCount) hardDeleteBlockers.push('INSPECTION_HISTORY');
    const archiveBlockers: string[] = [];
    if (!inventory.isActive) archiveBlockers.push('ALREADY_ARCHIVED');
    if (total !== 0) archiveBlockers.push('PHYSICAL_STOCK');
    if (activeReservationCount) archiveBlockers.push('ACTIVE_RESERVATION');
    if (activeMaintenanceCount) archiveBlockers.push('ACTIVE_MAINTENANCE');
    if (activeInspectionCount) archiveBlockers.push('ACTIVE_INSPECTION');
    const restoreBlockers: string[] = [];
    if (inventory.isActive) restoreBlockers.push('ALREADY_ACTIVE');
    if (!inventory.product.isActive || inventory.product.deletedAt)
      restoreBlockers.push('PRODUCT_INACTIVE');
    return {
      inventoryId,
      isActive: inventory.isActive,
      canHardDelete: hardDeleteBlockers.length === 0,
      hardDeleteBlockers,
      canArchive: archiveBlockers.length === 0,
      archiveBlockers,
      canRestore: restoreBlockers.length === 0,
      restoreBlockers,
    };
  }

  private async physicalTotal(
    tx: Prisma.TransactionClient,
    inventory: { id: string; trackingMode: InventoryTrackingMode },
  ) {
    if (inventory.trackingMode === InventoryTrackingMode.SERIALIZED)
      return tx.inventoryItem.count({ where: { inventoryId: inventory.id } });
    const [incoming, outgoing] = await Promise.all([
      tx.inventoryTransaction.aggregate({
        where: { inventoryId: inventory.id, toState: { not: null } },
        _sum: { quantity: true },
      }),
      tx.inventoryTransaction.aggregate({
        where: { inventoryId: inventory.id, fromState: { not: null } },
        _sum: { quantity: true },
      }),
    ]);
    return (incoming._sum.quantity ?? 0) - (outgoing._sum.quantity ?? 0);
  }

  private async lockInventory(
    tx: Prisma.TransactionClient,
    inventoryId: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id"=${inventoryId} FOR UPDATE`;
  }

  private async lockAdminOperation(
    tx: Prisma.TransactionClient,
    operationId: string,
  ) {
    await tx.$queryRaw`
      SELECT 1 AS "locked"
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-admin:${operationId}`}, 0))) AS operation_lock`;
  }

  private payloadHash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async replayAudit(
    tx: Prisma.TransactionClient,
    operationId: string,
    inventoryId: string,
    payloadHash: string,
    action: string,
  ) {
    const previous = await tx.platformAuditEvent.findUnique({
      where: { sourceKey: `inventory-admin:${operationId}` },
    });
    if (!previous) return false;
    const metadata = previous.metadata as { payloadHash?: string } | null;
    if (
      previous.entityId === inventoryId &&
      previous.action === action &&
      metadata?.payloadHash === payloadHash
    )
      return true;
    throw new ConflictException('Operation ID was already used differently');
  }

  private async audit(
    tx: Prisma.TransactionClient,
    input: {
      action: string;
      actorId: string;
      inventoryId: string;
      operationId: string;
      payloadHash: string;
      productName: string;
      summary: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await tx.platformAuditEvent.create({
      data: {
        actorUserId: input.actorId,
        domain: 'INVENTORY',
        action: input.action,
        entityType: 'Inventory',
        entityId: input.inventoryId,
        entityReference: input.productName,
        summary: input.summary,
        sourceType: 'INVENTORY_ADMIN_OPERATION',
        sourceId: input.operationId,
        sourceKey: `inventory-admin:${input.operationId}`,
        metadata: {
          ...input.metadata,
          payloadHash: input.payloadHash,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async getItem(
    inventoryId: string,
    id: string,
  ): Promise<AdminInventoryItemResponse> {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, inventoryId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return {
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async requireMode(id: string, mode: InventoryTrackingMode) {
    const inventory = await prisma.inventory.findUnique({ where: { id } });
    if (!inventory) throw new NotFoundException('Inventory not found');
    if (inventory.trackingMode !== mode)
      throw new ConflictException(`Operation requires ${mode} inventory`);
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

  private mapMetadata(
    inventory: SelectedMetadata,
  ): AdminInventoryMetadataResponse {
    return {
      ...inventory,
      archivedAt: inventory.archivedAt?.toISOString() ?? null,
      createdAt: inventory.createdAt.toISOString(),
      updatedAt: inventory.updatedAt.toISOString(),
    };
  }

  private page<T>(
    items: T[],
    query: { page: number; pageSize: number },
    total: number,
  ): PaginatedResponse<T> {
    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
