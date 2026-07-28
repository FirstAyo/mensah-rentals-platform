import { createHmac } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import {
  prisma,
  Prisma,
  QuoteRevisionState,
  UserStatus,
} from '@mensah-rentals/database';
import type {
  PublicRentalChangeRequestResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import type {
  ApiEnvironment,
  ReviewRentalChangeRequestInput,
  SubmitRentalChangeRequestInput,
} from '@mensah-rentals/validation';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const changeSelect = {
  companyName: true,
  contactEmail: true,
  contactFirstName: true,
  contactLastName: true,
  contactPhone: true,
  createdAt: true,
  customerNotes: true,
  deliveryAddress: true,
  fulfillmentMethod: true,
  id: true,
  items: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    select: {
      categoryNameSnapshot: true,
      categorySlugSnapshot: true,
      changeType: true,
      id: true,
      previousQuantity: true,
      productId: true,
      productNameSnapshot: true,
      productSlugSnapshot: true,
      proposedQuantity: true,
      rentalUnitSnapshot: true,
      sortOrder: true,
    },
  },
  quoteId: true,
  projectLocation: true,
  projectName: true,
  projectType: true,
  reason: true,
  rentalEndDate: true,
  rentalStartDate: true,
  rentalOrderId: true,
  rentalRequestId: true,
  rentalRequest: { select: { referenceNumber: true } },
  reviewNote: true,
  reviewVersion: true,
  reviewedAt: true,
  requestedTimeZone: true,
  status: true,
} satisfies Prisma.RentalChangeRequestSelect;

type SelectedChange = Prisma.RentalChangeRequestGetPayload<{
  select: typeof changeSelect;
}>;

export interface AdminRentalChangeRequestResponse
  extends PublicRentalChangeRequestResponse {
  referenceNumber: string;
  rentalRequestId: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewVersion: number;
}

@Injectable()
export class RentalChangeRequestService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  async submit(
    rawToken: string | undefined,
    input: SubmitRentalChangeRequestInput,
  ): Promise<PublicRentalChangeRequestResponse> {
    const access = await this.requireAccess(rawToken);
    const payloadHash = hashSessionToken(JSON.stringify(input));
    const id = await this.serializable(async (tx) => {
      await this.lockRequest(tx, access.rentalRequestId);
      await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Quote"
          WHERE "rentalRequestId" = ${access.rentalRequestId}
          FOR UPDATE
        `;
      await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "RentalOrder"
          WHERE "rentalRequestId" = ${access.rentalRequestId}
          FOR UPDATE
        `;
      const replay = await tx.rentalChangeRequest.findUnique({
        where: { operationId: input.operationId },
        select: {
          id: true,
          payloadHash: true,
          rentalRequestId: true,
          submittedByCustomerAccessId: true,
        },
      });
      if (replay) {
        if (
          replay.payloadHash === payloadHash &&
          replay.rentalRequestId === access.rentalRequestId &&
          replay.submittedByCustomerAccessId === access.id
        )
          return replay.id;
        throw new ConflictException(
          'This operation identifier was already used differently.',
        );
      }
      const request = await tx.rentalRequest.findUniqueOrThrow({
        where: { id: access.rentalRequestId },
        select: {
          currentRevision: {
            select: {
              id: true,
              revisionNumber: true,
              items: {
                select: {
                  categoryNameSnapshot: true,
                  categorySlugSnapshot: true,
                  productId: true,
                  productNameSnapshot: true,
                  productSlugSnapshot: true,
                  rentalUnitSnapshot: true,
                  requestedQuantity: true,
                },
              },
            },
          },
          quote: {
            select: {
              id: true,
              customerRevisionId: true,
              customerRevision: {
                select: { lifecycle: { select: { state: true } } },
              },
            },
          },
          rentalOrder: {
            select: {
              id: true,
              acceptedQuoteRevisionId: true,
              quoteId: true,
            },
          },
        },
      });
      if (
        !request.currentRevision ||
        request.currentRevision.revisionNumber !== input.expectedRevisionNumber
      )
        throw new ConflictException(
          'This request changed since it was loaded. Refresh and try again.',
        );
      const quote = request.quote;
      if (
        !request.rentalOrder &&
        quote?.customerRevision?.lifecycle?.state !==
          QuoteRevisionState.ACCEPTED
      )
        throw new ConflictException(
          'An accepted quote or confirmed order is required for a formal change request.',
        );
      const products = await this.products(
        tx,
        input.items,
        request.currentRevision.id,
      );
      const previous = new Map(
        request.currentRevision.items.map((item) => [item.productId, item]),
      );
      const proposed = new Map(
        input.items.map((item) => [item.productId, item]),
      );
      const ids = [...new Set([...previous.keys(), ...proposed.keys()])];
      const change = await tx.rentalChangeRequest.create({
        data: {
          acceptedQuoteRevisionId:
            request.rentalOrder?.acceptedQuoteRevisionId ??
            quote?.customerRevisionId,
          companyName: input.companyName,
          contactEmail: input.contactEmail,
          contactFirstName: input.contactFirstName,
          contactLastName: input.contactLastName,
          contactPhone: input.contactPhone,
          customerNotes: input.customerNotes,
          deliveryAddress: input.deliveryAddress,
          fulfillmentMethod: input.fulfillmentMethod,
          operationId: input.operationId,
          payloadHash,
          projectLocation: input.projectLocation,
          projectName: input.projectName,
          projectType: input.projectType,
          quoteId: request.rentalOrder?.quoteId ?? quote?.id,
          reason: input.reason,
          rentalEndDate: this.date(input.rentalEndDate),
          rentalOrderId: request.rentalOrder?.id,
          rentalRequestId: access.rentalRequestId,
          rentalStartDate: this.date(input.rentalStartDate),
          requestedTimeZone: input.requestedTimeZone,
          sourceRevisionId: request.currentRevision.id,
          submittedByCustomerAccessId: access.id,
          items: {
            create: ids.map((productId, index) => {
              const oldItem = previous.get(productId);
              const newItem = productId ? proposed.get(productId) : undefined;
              const product =
                (productId ? products.get(productId) : undefined) ?? oldItem!;
              return {
                categoryNameSnapshot:
                  'category' in product
                    ? product.category.name
                    : product.categoryNameSnapshot,
                categorySlugSnapshot:
                  'category' in product
                    ? product.category.slug
                    : product.categorySlugSnapshot,
                changeType: !oldItem
                  ? ('ADDED' as const)
                  : !newItem
                    ? ('REMOVED' as const)
                    : oldItem.requestedQuantity === newItem.requestedQuantity
                      ? ('UNCHANGED' as const)
                      : ('QUANTITY_CHANGED' as const),
                previousQuantity: oldItem?.requestedQuantity,
                productId,
                productNameSnapshot:
                  'name' in product
                    ? product.name
                    : product.productNameSnapshot,
                productSlugSnapshot:
                  'slug' in product
                    ? product.slug
                    : product.productSlugSnapshot,
                proposedQuantity: newItem?.requestedQuantity,
                rentalUnitSnapshot:
                  'rentalUnit' in product
                    ? product.rentalUnit
                    : product.rentalUnitSnapshot,
                sortOrder: index,
              };
            }),
          },
        },
        select: { id: true },
      });
      await tx.rentalRequestActivity.create({
        data: {
          rentalRequestId: access.rentalRequestId,
          revisionId: request.currentRevision.id,
          type: 'CHANGE_REQUEST_SUBMITTED',
        },
      });
      return change.id;
    });
    return this.publicById(access.rentalRequestId, id);
  }

  async current(
    rawToken?: string,
  ): Promise<PublicRentalChangeRequestResponse[]> {
    const access = await this.requireAccess(rawToken);
    const changes = await prisma.rentalChangeRequest.findMany({
      where: { rentalRequestId: access.rentalRequestId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: changeSelect,
    });
    return changes.map((change) => this.mapPublic(change));
  }

  async publicDetail(
    rawToken: string | undefined,
    id: string,
  ): Promise<PublicRentalChangeRequestResponse> {
    const access = await this.requireAccess(rawToken);
    return this.publicById(access.rentalRequestId, id);
  }

  async adminList(): Promise<AdminRentalChangeRequestResponse[]> {
    return (
      await prisma.rentalChangeRequest.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: changeSelect,
      })
    ).map((change) => this.mapAdmin(change));
  }

  async adminDetail(id: string): Promise<AdminRentalChangeRequestResponse> {
    const change = await prisma.rentalChangeRequest.findUnique({
      where: { id },
      select: changeSelect,
    });
    if (!change) throw new NotFoundException('Change request not found');
    return this.mapAdmin(change);
  }

  async review(
    actor: StaffUserResponse,
    id: string,
    input: ReviewRentalChangeRequestInput,
  ): Promise<AdminRentalChangeRequestResponse> {
    const payloadHash = hashSessionToken(JSON.stringify(input));
    await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actor.id, [
        'rental_change_request.view',
        'rental_change_request.review',
      ]);
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "RentalChangeRequest" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException('Change request not found');
      const change = await tx.rentalChangeRequest.findUniqueOrThrow({
        where: { id },
        select: {
          rentalRequestId: true,
          reviewVersion: true,
          status: true,
        },
      });
      if (change.reviewVersion !== input.expectedVersion)
        throw new ConflictException(
          'This change request changed since it was loaded.',
        );
      if (
        !['SUBMITTED', 'UNDER_REVIEW'].includes(change.status) ||
        (change.status === 'UNDER_REVIEW' && input.status === 'UNDER_REVIEW')
      )
        throw new ConflictException(
          'This review transition is no longer allowed.',
        );
      await tx.rentalChangeRequest.update({
        where: { id },
        data: {
          reviewNote: input.internalNote,
          ...(input.status === 'UNDER_REVIEW'
            ? { reviewedAt: null, reviewedByUserId: null }
            : { reviewedAt: new Date(), reviewedByUserId: actor.id }),
          reviewVersion: { increment: 1 },
          status: input.status,
        },
      });
      await tx.rentalRequestActivity.create({
        data: {
          actorUserId: actor.id,
          rentalRequestId: change.rentalRequestId,
          type: 'CHANGE_REQUEST_REVIEWED',
        },
      });
      void payloadHash;
    });
    return this.adminDetail(id);
  }

  private async publicById(
    rentalRequestId: string,
    id: string,
  ): Promise<PublicRentalChangeRequestResponse> {
    const change = await prisma.rentalChangeRequest.findFirst({
      where: { id, rentalRequestId },
      select: changeSelect,
    });
    if (!change) throw this.unavailable();
    return this.mapPublic(change);
  }

  private mapPublic(change: SelectedChange): PublicRentalChangeRequestResponse {
    return {
      companyName: change.companyName,
      contactEmail: change.contactEmail,
      contactFirstName: change.contactFirstName,
      contactLastName: change.contactLastName,
      contactPhone: change.contactPhone,
      createdAt: change.createdAt.toISOString(),
      customerNotes: change.customerNotes,
      deliveryAddress: change.deliveryAddress,
      fulfillmentMethod: change.fulfillmentMethod,
      id: change.id,
      items: change.items.map((item) => ({
        categoryName: item.categoryNameSnapshot,
        categorySlug: item.categorySlugSnapshot,
        changeType: item.changeType,
        id: item.id,
        previousQuantity: item.previousQuantity,
        productId: item.productId,
        productName: item.productNameSnapshot,
        productSlug: item.productSlugSnapshot,
        proposedQuantity: item.proposedQuantity,
        rentalUnit: item.rentalUnitSnapshot,
        requestedQuantity: item.proposedQuantity ?? item.previousQuantity ?? 0,
        sortOrder: item.sortOrder,
      })),
      projectLocation: change.projectLocation,
      projectName: change.projectName,
      projectType: change.projectType,
      reason: change.reason,
      rentalEndDate: change.rentalEndDate.toISOString().slice(0, 10),
      rentalStartDate: change.rentalStartDate.toISOString().slice(0, 10),
      requestedTimeZone: change.requestedTimeZone,
      source: change.rentalOrderId
        ? ('CONFIRMED_ORDER' as const)
        : ('ACCEPTED_QUOTE' as const),
      status: change.status,
    };
  }

  private mapAdmin(change: SelectedChange): AdminRentalChangeRequestResponse {
    return {
      ...this.mapPublic(change),
      rentalRequestId: change.rentalRequestId,
      referenceNumber: change.rentalRequest.referenceNumber,
      reviewNote: change.reviewNote,
      reviewedAt: change.reviewedAt?.toISOString() ?? null,
      reviewVersion: change.reviewVersion,
    };
  }

  private async requireAccess(rawToken?: string) {
    const hash = hashSessionToken(
      rawToken && TOKEN_PATTERN.test(rawToken)
        ? rawToken
        : createHmac(
            'sha256',
            this.config.get('PUBLIC_REQUEST_TRACKING_SECRET', { infer: true }),
          )
            .update('invalid')
            .digest('base64url'),
    );
    const access = await prisma.rentalRequestCustomerAccess.findFirst({
      where: {
        tokenHash: hash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, rentalRequestId: true },
    });
    if (!access) throw this.unavailable();
    return access;
  }

  private unavailable() {
    return new NotFoundException('Rental request could not be found.');
  }

  private async products(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string; requestedQuantity: number }>,
    currentRevisionId: string,
  ) {
    const ids = items.map(({ productId }) => productId);
    const products = await tx.product.findMany({
      where: { id: { in: ids } },
      select: {
        category: { select: { isActive: true, name: true, slug: true } },
        id: true,
        isActive: true,
        name: true,
        rentalUnit: true,
        slug: true,
      },
    });
    const historical = new Set(
      (
        await tx.rentalRequestRevisionItem.findMany({
          where: {
            rentalRequestRevisionId: currentRevisionId,
            productId: { in: ids },
          },
          select: { productId: true },
        })
      ).map(({ productId }) => productId),
    );
    if (
      products.length !== ids.length ||
      products.some(
        (product) =>
          (!product.isActive || !product.category.isActive) &&
          !historical.has(product.id),
      )
    )
      throw new UnprocessableEntityException(
        'One or more newly added products are no longer listed.',
      );
    return new Map(products.map((product) => [product.id, product]));
  }

  private async lockRequest(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RentalRequest" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!rows.length) throw this.unavailable();
  }

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;
        if (code === 'P2034' && attempt < 2) continue;
        if (code === 'P2002' || code === 'P2034')
          throw new ConflictException(
            'This request changed while the change request was submitted. Refresh and try again.',
          );
        throw error;
      }
    }
    throw new ConflictException(
      'This request changed while the change request was submitted. Refresh and try again.',
    );
  }

  private async requireActor(
    tx: Prisma.TransactionClient,
    actorId: string,
    permissions: string[],
  ) {
    const actor = await tx.user.findFirst({
      where: { id: actorId, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException('Insufficient permissions');
    const granted = await tx.permission.findMany({
      where: {
        key: { in: permissions },
        roles: { some: { role: { users: { some: { userId: actorId } } } } },
      },
      select: { key: true },
    });
    const keys = new Set(granted.map(({ key }) => key));
    if (permissions.some((permission) => !keys.has(permission)))
      throw new ForbiddenException('Insufficient permissions');
  }

  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }
}
