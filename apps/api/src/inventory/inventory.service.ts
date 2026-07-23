import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryState,
  InventoryTrackingMode,
  InventoryTransactionKind,
  Prisma,
  UserStatus,
  prisma,
} from '@mensah-rentals/database';
import type {
  AdminInventoryItemResponse,
  AdminInventoryMetadataResponse,
  AdminInventoryQuantityResponse,
  AdminInventoryTransactionResponse,
  InventoryStateResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import type {
  BulkInventoryMovementInput,
  CreateInventoryInput,
  CreateInventoryItemInput,
  InventoryListQuery,
  InventoryPageQuery,
  TransitionInventoryItemInput,
} from '@mensah-rentals/validation';

const STATES = Object.values(InventoryState);
const INVENTORY_CREATION_LOCK = 2_026_072_313;
const metadataSelect = {
  id: true,
  trackingMode: true,
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

  async create(actorId: string, input: CreateInventoryInput) {
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
    return {
      inventoryId: id,
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
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actorId, [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.adjust',
      ]);
      await tx.$executeRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${inventoryId} FOR UPDATE`;
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
      if (item.status === input.toState)
        throw new ConflictException('Item is already in that state');
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
