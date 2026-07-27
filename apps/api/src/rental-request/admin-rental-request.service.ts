import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryTrackingMode,
  prisma,
  type Prisma,
  RentalRequestActivityType,
  RentalRequestStatus,
  UserStatus,
} from '@mensah-rentals/database';
import type {
  AdminRentalRequestActivityResponse,
  AdminRentalRequestAssigneeResponse,
  AdminRentalRequestDetailResponse,
  AdminRentalRequestInventoryContext,
  AdminRentalRequestNoteResponse,
  AdminRentalRequestSummaryResponse,
  InventoryStateResponse,
  PaginatedResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import type {
  AdminRentalRequestListQuery,
  CreateRentalRequestInternalNoteInput,
  UnassignRentalRequestInput,
  UpdateRentalRequestAssignmentInput,
  UpdateRentalRequestReviewStateInput,
} from '@mensah-rentals/validation';

const INVENTORY_CONTEXT_NOTICE =
  'Current internal inventory context only. Date-based booking conflicts are not yet calculated. No inventory is reserved by this review.';

const staffSelect = {
  firstName: true,
  id: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const summarySelect = {
  assignedTo: { select: staffSelect },
  companyName: true,
  contactEmail: true,
  contactFirstName: true,
  contactLastName: true,
  contactPhone: true,
  fulfillmentMethod: true,
  id: true,
  projectName: true,
  referenceNumber: true,
  rentalEndDate: true,
  rentalStartDate: true,
  reviewVersion: true,
  status: true,
  submittedAt: true,
  updatedAt: true,
} satisfies Prisma.RentalRequestSelect;

const detailSelect = {
  ...summarySelect,
  assignedAt: true,
  customerNotes: true,
  deliveryAddress: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      categoryName: true,
      categorySlug: true,
      id: true,
      productId: true,
      productName: true,
      productSlug: true,
      rentalUnit: true,
      requestedQuantity: true,
    },
  },
  projectLocation: true,
  projectType: true,
  requestedTimeZone: true,
  reviewStartedAt: true,
} satisfies Prisma.RentalRequestSelect;

const noteSelect = {
  author: { select: staffSelect },
  body: true,
  createdAt: true,
  id: true,
} satisfies Prisma.RentalRequestInternalNoteSelect;

const activitySelect = {
  actor: { select: staffSelect },
  createdAt: true,
  id: true,
  newAssignee: { select: staffSelect },
  newStatus: true,
  noteId: true,
  previousAssignee: { select: staffSelect },
  previousStatus: true,
  type: true,
} satisfies Prisma.RentalRequestActivitySelect;

type SelectedSummary = Prisma.RentalRequestGetPayload<{
  select: typeof summarySelect;
}>;
type SelectedDetail = Prisma.RentalRequestGetPayload<{
  select: typeof detailSelect;
}>;
type SelectedNote = Prisma.RentalRequestInternalNoteGetPayload<{
  select: typeof noteSelect;
}>;
type SelectedActivity = Prisma.RentalRequestActivityGetPayload<{
  select: typeof activitySelect;
}>;

const STATES: InventoryStateResponse[] = [
  'RENTABLE',
  'RENTED',
  'MAINTENANCE',
  'DAMAGED',
  'LOST',
  'RETIRED',
];

@Injectable()
export class AdminRentalRequestService {
  async list(
    actor: StaffUserResponse,
    query: AdminRentalRequestListQuery,
  ): Promise<PaginatedResponse<AdminRentalRequestSummaryResponse>> {
    const where: Prisma.RentalRequestWhereInput = {
      ...(query.search
        ? {
            OR: [
              {
                referenceNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                contactFirstName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                contactLastName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                contactEmail: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { contactPhone: { contains: query.search } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fulfillmentMethod
        ? { fulfillmentMethod: query.fulfillmentMethod }
        : {}),
      ...(query.assignedToUserId
        ? { assignedToUserId: query.assignedToUserId }
        : query.assignment === 'ASSIGNED'
          ? { assignedToUserId: { not: null } }
          : query.assignment === 'UNASSIGNED'
            ? { assignedToUserId: null }
            : query.assignment === 'MINE'
              ? { assignedToUserId: actor.id }
              : {}),
      ...(query.rentalStartFrom || query.rentalStartTo
        ? {
            rentalStartDate: {
              ...(query.rentalStartFrom
                ? { gte: this.date(query.rentalStartFrom) }
                : {}),
              ...(query.rentalStartTo
                ? { lte: this.date(query.rentalStartTo) }
                : {}),
            },
          }
        : {}),
    };
    const orderBy = [
      { [query.sortBy]: query.sortDirection },
      { id: query.sortDirection },
    ] as Prisma.RentalRequestOrderByWithRelationInput[];
    const [total, items] = await prisma.$transaction([
      prisma.rentalRequest.count({ where }),
      prisma.rentalRequest.findMany({
        where,
        select: summarySelect,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: items.map((item) => this.mapSummary(item)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async detail(
    actor: StaffUserResponse,
    id: string,
  ): Promise<AdminRentalRequestDetailResponse> {
    const request = await prisma.rentalRequest.findUnique({
      where: { id },
      select: detailSelect,
    });
    if (!request) throw new NotFoundException('Rental request not found');
    const mayViewInventory =
      actor.permissionKeys.includes('inventory.view') &&
      actor.permissionKeys.includes('inventory.quantity.view');
    const contexts = mayViewInventory
      ? await this.inventoryContexts(
          request.items.map(({ productId }) => productId),
        )
      : new Map<string, AdminRentalRequestInventoryContext>();
    return {
      ...this.mapSummary(request),
      assignedAt: this.instant(request.assignedAt),
      customerNotes: request.customerNotes,
      deliveryAddress: request.deliveryAddress,
      items: request.items.map((item) => {
        const inventoryContext = contexts.get(item.productId);
        return {
          categoryName: item.categoryName,
          categorySlug: item.categorySlug,
          id: item.id,
          ...(inventoryContext ? { inventoryContext } : {}),
          productId: item.productId,
          productName: item.productName,
          productSlug: item.productSlug,
          rentalUnit: item.rentalUnit,
          requestedQuantity: item.requestedQuantity,
        };
      }),
      projectLocation: request.projectLocation,
      projectType: request.projectType,
      requestedTimeZone: request.requestedTimeZone,
      reviewStartedAt: this.instant(request.reviewStartedAt),
    };
  }

  async assignees(): Promise<AdminRentalRequestAssigneeResponse[]> {
    return prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            role: {
              permissions: {
                some: { permission: { key: 'rental_request.view' } },
              },
            },
          },
        },
      },
      select: staffSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
    });
  }

  async assign(
    actor: StaffUserResponse,
    id: string,
    input: UpdateRentalRequestAssignmentInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actor.id, [
        'rental_request.view',
        'rental_request.assign',
      ]);
      const request = await this.lockRequest(tx, id);
      this.requireVersion(request.reviewVersion, input.expectedVersion);
      if (request.assignedToUserId === input.assigneeUserId)
        throw new ConflictException('Request is already assigned to this user');
      const assignee = await tx.user.findFirst({
        where: {
          id: input.assigneeUserId,
          status: UserStatus.ACTIVE,
          roles: {
            some: {
              role: {
                permissions: {
                  some: { permission: { key: 'rental_request.view' } },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      if (!assignee)
        throw new ConflictException(
          'Assignee must be an active staff member who can view rental requests',
        );
      const previousAssigneeUserId = request.assignedToUserId;
      await tx.rentalRequest.update({
        where: { id },
        data: {
          assignedAt: new Date(),
          assignedToUserId: input.assigneeUserId,
          reviewVersion: { increment: 1 },
        },
      });
      await tx.rentalRequestActivity.create({
        data: {
          actorUserId: actor.id,
          newAssigneeUserId: input.assigneeUserId,
          previousAssigneeUserId,
          rentalRequestId: id,
          type: previousAssigneeUserId
            ? RentalRequestActivityType.REASSIGNED
            : RentalRequestActivityType.ASSIGNED,
        },
      });
    });
    return this.detail(actor, id);
  }

  async unassign(
    actor: StaffUserResponse,
    id: string,
    input: UnassignRentalRequestInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actor.id, [
        'rental_request.view',
        'rental_request.assign',
      ]);
      const request = await this.lockRequest(tx, id);
      this.requireVersion(request.reviewVersion, input.expectedVersion);
      if (!request.assignedToUserId)
        throw new ConflictException('Request is not currently assigned');
      await tx.rentalRequest.update({
        where: { id },
        data: {
          assignedAt: null,
          assignedToUserId: null,
          reviewVersion: { increment: 1 },
        },
      });
      await tx.rentalRequestActivity.create({
        data: {
          actorUserId: actor.id,
          previousAssigneeUserId: request.assignedToUserId,
          rentalRequestId: id,
          type: RentalRequestActivityType.UNASSIGNED,
        },
      });
    });
    return this.detail(actor, id);
  }

  async notes(id: string): Promise<AdminRentalRequestNoteResponse[]> {
    await this.ensureRequest(id);
    const notes = await prisma.rentalRequestInternalNote.findMany({
      where: { rentalRequestId: id },
      select: noteSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return notes.map((note) => this.mapNote(note));
  }

  async addNote(
    actor: StaffUserResponse,
    id: string,
    input: CreateRentalRequestInternalNoteInput,
  ): Promise<AdminRentalRequestNoteResponse> {
    try {
      const noteId = await prisma.$transaction(async (tx) => {
        await this.requireActor(tx, actor.id, [
          'rental_request.view',
          'rental_request.update',
        ]);
        await this.lockRequest(tx, id);
        const replay = await tx.rentalRequestInternalNote.findUnique({
          where: { operationId: input.operationId },
          select: {
            authorUserId: true,
            body: true,
            id: true,
            rentalRequestId: true,
          },
        });
        if (replay) {
          if (
            replay.authorUserId === actor.id &&
            replay.rentalRequestId === id &&
            replay.body === input.body
          )
            return replay.id;
          throw new ConflictException(
            'This note operation identifier was already used differently',
          );
        }
        const note = await tx.rentalRequestInternalNote.create({
          data: {
            authorUserId: actor.id,
            body: input.body,
            operationId: input.operationId,
            rentalRequestId: id,
          },
          select: { id: true },
        });
        await tx.rentalRequestActivity.create({
          data: {
            actorUserId: actor.id,
            noteId: note.id,
            rentalRequestId: id,
            type: RentalRequestActivityType.NOTE_ADDED,
          },
        });
        await tx.rentalRequest.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
        return note.id;
      });
      return this.getNote(noteId);
    } catch (error) {
      if (this.code(error) !== 'P2002') throw error;
      const replay = await prisma.rentalRequestInternalNote.findUnique({
        where: { operationId: input.operationId },
        select: { ...noteSelect, authorUserId: true, rentalRequestId: true },
      });
      if (
        replay &&
        replay.authorUserId === actor.id &&
        replay.rentalRequestId === id &&
        replay.body === input.body
      )
        return this.mapNote(replay);
      throw new ConflictException(
        'This note operation identifier was already used differently',
      );
    }
  }

  async startReview(
    actor: StaffUserResponse,
    id: string,
    input: UpdateRentalRequestReviewStateInput,
  ) {
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actor.id, [
        'rental_request.view',
        'rental_request.update',
      ]);
      const request = await this.lockRequest(tx, id);
      this.requireVersion(request.reviewVersion, input.expectedVersion);
      if (request.status !== RentalRequestStatus.SUBMITTED)
        throw new ConflictException('Request review has already started');
      const now = new Date();
      await tx.rentalRequest.update({
        where: { id },
        data: {
          reviewStartedAt: now,
          reviewVersion: { increment: 1 },
          status: RentalRequestStatus.UNDER_REVIEW,
        },
      });
      await tx.rentalRequestActivity.create({
        data: {
          actorUserId: actor.id,
          newStatus: RentalRequestStatus.UNDER_REVIEW,
          previousStatus: RentalRequestStatus.SUBMITTED,
          rentalRequestId: id,
          type: RentalRequestActivityType.REVIEW_STARTED,
        },
      });
    });
    return this.detail(actor, id);
  }

  async activity(id: string): Promise<AdminRentalRequestActivityResponse[]> {
    await this.ensureRequest(id);
    const activity = await prisma.rentalRequestActivity.findMany({
      where: { rentalRequestId: id },
      select: activitySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return activity.map((item) => this.mapActivity(item));
  }

  private async inventoryContexts(productIds: string[]) {
    const inventories = await prisma.inventory.findMany({
      where: { productId: { in: productIds } },
      select: {
        items: { select: { status: true } },
        productId: true,
        trackingMode: true,
        transactions: {
          select: { fromState: true, quantity: true, toState: true },
        },
      },
    });
    return new Map(
      inventories.map((inventory) => {
        const states = Object.fromEntries(
          STATES.map((state) => [state, 0]),
        ) as Record<InventoryStateResponse, number>;
        if (inventory.trackingMode === InventoryTrackingMode.SERIALIZED) {
          for (const item of inventory.items) states[item.status] += 1;
        } else {
          for (const transaction of inventory.transactions) {
            if (transaction.fromState)
              states[transaction.fromState] -= transaction.quantity;
            if (transaction.toState)
              states[transaction.toState] += transaction.quantity;
          }
        }
        return [
          inventory.productId,
          {
            notice: INVENTORY_CONTEXT_NOTICE,
            states,
            totalQuantity: Object.values(states).reduce(
              (total, quantity) => total + quantity,
              0,
            ),
            trackingMode: inventory.trackingMode,
          } satisfies AdminRentalRequestInventoryContext,
        ];
      }),
    );
  }

  private async requireActor(
    tx: Prisma.TransactionClient,
    actorId: string,
    permissions: string[],
  ) {
    const actor = await tx.user.findFirst({
      where: { id: actorId, status: UserStatus.ACTIVE },
      select: {
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    });
    const keys = new Set(
      actor?.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission: item }) => item.key),
      ) ?? [],
    );
    if (!actor || permissions.some((permission) => !keys.has(permission)))
      throw new ForbiddenException('Insufficient permissions');
  }

  private async lockRequest(tx: Prisma.TransactionClient, id: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RentalRequest" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!locked.length) throw new NotFoundException('Rental request not found');
    return tx.rentalRequest.findUniqueOrThrow({
      where: { id },
      select: { assignedToUserId: true, reviewVersion: true, status: true },
    });
  }

  private requireVersion(current: number, expected: number) {
    if (current !== expected)
      throw new ConflictException(
        'This request changed since it was loaded. Refresh and try again.',
      );
  }

  private async ensureRequest(id: string) {
    const request = await prisma.rentalRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Rental request not found');
  }

  private async getNote(id: string) {
    const note = await prisma.rentalRequestInternalNote.findUniqueOrThrow({
      where: { id },
      select: noteSelect,
    });
    return this.mapNote(note);
  }

  private mapSummary(
    request: SelectedSummary | SelectedDetail,
  ): AdminRentalRequestSummaryResponse {
    return {
      assignedTo: request.assignedTo,
      companyName: request.companyName,
      contactEmail: request.contactEmail,
      contactFirstName: request.contactFirstName,
      contactLastName: request.contactLastName,
      contactPhone: request.contactPhone,
      fulfillmentMethod: request.fulfillmentMethod,
      id: request.id,
      projectName: request.projectName,
      referenceNumber: request.referenceNumber,
      rentalEndDate: this.calendarDate(request.rentalEndDate),
      rentalStartDate: this.calendarDate(request.rentalStartDate),
      reviewVersion: request.reviewVersion,
      status: request.status,
      submittedAt: request.submittedAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private mapNote(note: SelectedNote): AdminRentalRequestNoteResponse {
    return {
      author: note.author,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      id: note.id,
    };
  }

  private mapActivity(
    item: SelectedActivity,
  ): AdminRentalRequestActivityResponse {
    return {
      actor: item.actor,
      createdAt: item.createdAt.toISOString(),
      id: item.id,
      newAssignee: item.newAssignee,
      newStatus: item.newStatus,
      noteId: item.noteId,
      previousAssignee: item.previousAssignee,
      previousStatus: item.previousStatus,
      type: item.type,
    };
  }

  private calendarDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private instant(value: Date | null) {
    return value?.toISOString() ?? null;
  }

  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private code(error: unknown): string | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
      ? error.code
      : undefined;
  }
}
