import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  prisma,
  Prisma,
  QuoteRevisionState,
  RentalOrderActivityType,
  RentalRequestStatus,
  UserStatus,
} from '@mensah-rentals/database';
import type {
  AdminRentalOrderCreateResponse,
  AdminRentalOrderDetailResponse,
  AdminRentalOrderSummaryResponse,
  AdminCustomerAccessMutationResponse,
  PaginatedResponse,
  PublicRentalOrderResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import {
  calculateQuoteMoney,
  type ApiEnvironment,
  type CreateRentalOrderInput,
  type OrderAccessOperationInput,
  type RentalOrderListQuery,
} from '@mensah-rentals/validation';

import {
  buildSelectableTextPdf,
  safePdfFilename,
} from '../common/selectable-text-pdf';

const unavailable = () => new NotFoundException('Order is unavailable');
const notice =
  'Your rental order is confirmed. Equipment allocation and fulfillment scheduling will be completed by our team. Inventory is not reserved yet.';

const orderInclude = {
  activities: {
    include: {
      actor: { select: { firstName: true, id: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  charges: { orderBy: { sortOrder: 'asc' as const } },
  confirmedBy: { select: { firstName: true, id: true, lastName: true } },
  items: { orderBy: { sortOrder: 'asc' as const } },
  quote: { select: { quoteNumber: true } },
  rentalRequest: { select: { referenceNumber: true } },
  tax: true,
  customerAccess: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.RentalOrderInclude;

type OrderRecord = Prisma.RentalOrderGetPayload<{
  include: typeof orderInclude;
}>;

@Injectable()
export class RentalOrderService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  async list(
    query: RentalOrderListQuery,
  ): Promise<PaginatedResponse<AdminRentalOrderSummaryResponse>> {
    const where: Prisma.RentalOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.reservationStatus
        ? { reservationStatus: query.reservationStatus }
        : {}),
      ...(query.fulfillmentMethod
        ? { fulfillmentMethodSnapshot: query.fulfillmentMethod }
        : {}),
      ...(query.rentalStartFrom || query.rentalStartTo
        ? {
            rentalStartDateSnapshot: {
              ...(query.rentalStartFrom
                ? { gte: new Date(`${query.rentalStartFrom}T00:00:00.000Z`) }
                : {}),
              ...(query.rentalStartTo
                ? { lte: new Date(`${query.rentalStartTo}T00:00:00.000Z`) }
                : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              {
                quote: {
                  quoteNumber: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                rentalRequest: {
                  referenceNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                contactEmailSnapshot: {
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
          }
        : {}),
    };
    const primary: Prisma.RentalOrderOrderByWithRelationInput =
      query.sortBy === 'rentalStartDate'
        ? { rentalStartDateSnapshot: query.sortDirection }
        : query.sortBy === 'total'
          ? { totalCents: query.sortDirection }
          : { confirmedAt: query.sortDirection };
    const [rows, total] = await prisma.$transaction([
      prisma.rentalOrder.findMany({
        where,
        orderBy: [primary, { id: query.sortDirection }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { quote: true, rentalRequest: true },
      }),
      prisma.rentalOrder.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.mapSummary(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async detail(id: string): Promise<AdminRentalOrderDetailResponse> {
    const order = await prisma.rentalOrder.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Rental order not found');
    return this.mapDetail(order);
  }

  async create(
    actor: StaffUserResponse,
    quoteId: string,
    revisionId: string,
    input: CreateRentalOrderInput,
  ): Promise<AdminRentalOrderCreateResponse> {
    const payloadHash = this.hash({
      action: 'create-order',
      quoteId,
      revisionId,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            await this.requireActor(tx, actor.id, ['order.create']);
            const quoteIdentity = await tx.quote.findUnique({
              where: { id: quoteId },
              select: { rentalRequestId: true },
            });
            if (!quoteIdentity) throw new NotFoundException('Quote not found');
            await this.lockRentalRequest(tx, quoteIdentity.rentalRequestId);
            await this.lockQuote(tx, quoteId);
            await this.lockOrderForRequest(tx, quoteIdentity.rentalRequestId);
            const replay = await tx.rentalOrder.findUnique({
              where: { operationId: input.operationId },
            });
            if (replay) {
              if (
                replay.confirmedByUserId === actor.id &&
                replay.quoteId === quoteId &&
                replay.acceptedQuoteRevisionId === revisionId &&
                replay.payloadHash === payloadHash
              )
                return {
                  orderId: replay.id,
                  orderNumber: replay.orderNumber,
                };
              throw new ConflictException(
                'Operation identifier was reused differently',
              );
            }
            const quote = await tx.quote.findUnique({
              where: { id: quoteId },
              include: {
                rentalOrder: true,
                rentalRequest: {
                  include: {
                    currentRevision: true,
                    decisions: {
                      where: { supersededAt: null },
                      orderBy: { decidedAt: 'desc' },
                      take: 1,
                    },
                  },
                },
                customerRevision: {
                  include: {
                    charges: { orderBy: { sortOrder: 'asc' } },
                    customerResponse: true,
                    items: { orderBy: { sortOrder: 'asc' } },
                    lifecycle: true,
                    tax: true,
                  },
                },
              },
            });
            if (!quote) throw new NotFoundException('Quote not found');
            if (
              !quote.customerRevision ||
              quote.customerRevision.id !== revisionId
            )
              throw new ConflictException(
                'Only the authoritative accepted customer revision can become an order',
              );
            if (quote.rentalOrder)
              throw new ConflictException(
                'This accepted quote already has an order',
              );
            const revision = quote.customerRevision;
            const response = revision.customerResponse;
            const lifecycle = revision.lifecycle;
            const decision = quote.rentalRequest.decisions[0];
            const requestRevision = quote.rentalRequest.currentRevision;
            if (
              lifecycle?.state !== QuoteRevisionState.ACCEPTED ||
              response?.response !== 'ACCEPTED' ||
              response.respondedAt > revision.validUntil ||
              !lifecycle.terminalAt ||
              !decision ||
              !requestRevision ||
              decision.id !== revision.rentalRequestDecisionId ||
              decision.rentalRequestRevisionId !==
                quote.rentalRequest.currentRevisionId ||
              decision.rentalRequestId !== quote.rentalRequestId ||
              (quote.rentalRequest.status !== RentalRequestStatus.APPROVED &&
                quote.rentalRequest.status !==
                  RentalRequestStatus.PARTIALLY_APPROVED)
            )
              throw new ConflictException(
                'The quote revision is not eligible for order conversion',
              );
            const actionableChangeRequest =
              await tx.rentalChangeRequest.findFirst({
                where: {
                  acceptedQuoteRevisionId: revisionId,
                  rentalRequestId: quote.rentalRequestId,
                  status: {
                    in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED_FOR_REQUOTE'],
                  },
                },
                select: { id: true },
              });
            if (actionableChangeRequest)
              throw new ConflictException(
                'This accepted quote has a pending formal change request and cannot become an order',
              );
            this.verifyMoney(revision);
            const orderId = this.cuidLike();
            const now = await this.databaseNow(tx);
            const order = await tx.rentalOrder.create({
              data: {
                id: orderId,
                acceptedQuoteRevisionId: revision.id,
                acceptedRevisionNumber: revision.revisionNumber,
                chargeTotalCents: revision.chargeTotalCents,
                companyNameSnapshot: requestRevision.companyName,
                confirmedAt: now,
                confirmedByUserId: actor.id,
                contactEmailSnapshot: requestRevision.contactEmail,
                contactFirstNameSnapshot: requestRevision.contactFirstName,
                contactLastNameSnapshot: requestRevision.contactLastName,
                contactPhoneSnapshot: requestRevision.contactPhone,
                currency: revision.currency,
                deliveryAddressSnapshot: requestRevision.deliveryAddress,
                discountCents: revision.discountCents,
                discountBaseCents: revision.discountBaseCents,
                discountRateBasisPoints: revision.discountRateBasisPoints,
                discountTaxable: revision.discountTaxable,
                discountType: revision.discountType,
                fulfillmentMethodSnapshot: requestRevision.fulfillmentMethod,
                itemSubtotalCents: revision.itemSubtotalCents,
                operationId: input.operationId,
                orderNumber: this.orderNumber(),
                payloadHash,
                projectLocationSnapshot: requestRevision.projectLocation,
                projectNameSnapshot: requestRevision.projectName,
                projectTypeSnapshot: requestRevision.projectType,
                quoteCustomerNotesSnapshot: revision.customerNotes,
                quoteId,
                rentalEndDateSnapshot: requestRevision.rentalEndDate,
                rentalRequestDecisionId: decision.id,
                rentalRequestId: quote.rentalRequestId,
                rentalStartDateSnapshot: requestRevision.rentalStartDate,
                requestCustomerNotesSnapshot: requestRevision.customerNotes,
                requestedTimeZoneSnapshot: requestRevision.requestedTimeZone,
                subtotalCents: revision.subtotalCents,
                taxCents: revision.taxCents,
                taxableDiscountCents: revision.taxableDiscountCents,
                taxableSubtotalCents: revision.taxableSubtotalCents,
                termsSnapshot: revision.terms,
                totalCents: revision.totalCents,
                items: {
                  create: revision.items.map((item) => ({
                    approvedQuantitySnapshot: item.approvedQuantitySnapshot,
                    categoryNameSnapshot: item.categoryNameSnapshot,
                    categorySlugSnapshot: item.categorySlugSnapshot,
                    lineSubtotalCents: item.lineSubtotalCents,
                    productIdSnapshot: item.productIdSnapshot,
                    productNameSnapshot: item.productNameSnapshot,
                    productSlugSnapshot: item.productSlugSnapshot,
                    quotedQuantity: item.quotedQuantity,
                    rentalUnitSnapshot: item.rentalUnitSnapshot,
                    sortOrder: item.sortOrder,
                    sourceQuoteRevisionItemId: item.id,
                    taxable: item.taxable,
                    unitPriceCents: item.unitPriceCents,
                  })),
                },
                charges: {
                  create: revision.charges.map((charge) => ({
                    amountCents: charge.amountCents,
                    label: charge.label,
                    sortOrder: charge.sortOrder,
                    sourceQuoteRevisionChargeId: charge.id,
                    taxable: charge.taxable,
                    type: charge.type,
                  })),
                },
                tax: {
                  create: {
                    name: revision.tax!.name,
                    rateBasisPoints: revision.tax!.rateBasisPoints,
                    sourceQuoteRevisionTaxId: revision.tax!.id,
                    taxAmountCents: revision.tax!.taxAmountCents,
                    taxableAmountCents: revision.tax!.taxableAmountCents,
                  },
                },
                activities: {
                  create: {
                    actorUserId: actor.id,
                    type: RentalOrderActivityType.ORDER_CREATED,
                  },
                },
              },
              select: { id: true, orderNumber: true },
            });
            return {
              orderId: order.id,
              orderNumber: order.orderNumber,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return {
          order: { id: result.orderId, orderNumber: result.orderNumber },
        };
      } catch (error) {
        if (this.code(error) === 'P2034' && attempt < 4) continue;
        if (this.isOrderNumberCollision(error) && attempt < 4) continue;
        if (this.isOrderNumberCollision(error))
          throw new ConflictException(
            'A unique rental order number could not be generated',
          );
        if (this.code(error) === 'P2002')
          throw new ConflictException(
            'This accepted quote already has an order',
          );
        throw error;
      }
    }
    throw new ConflictException(
      'A unique rental order number could not be generated',
    );
  }

  async generateCustomerAccess(
    actor: StaffUserResponse,
    orderId: string,
    input: OrderAccessOperationInput,
  ): Promise<AdminCustomerAccessMutationResponse> {
    return prisma.$transaction(
      async (tx) => {
        await this.requireActor(tx, actor.id, ['order.view', 'order.update']);
        await this.lockOrder(tx, orderId);
        const payloadHash = this.hash({ action: 'generate', orderId });
        const replay = await tx.orderCustomerAccess.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay)
          return this.replayAccessMutation(
            replay,
            actor.id,
            orderId,
            payloadHash,
            true,
          );
        await this.rejectActivityOperationReuse(tx, input.operationId);
        const now = await this.databaseNow(tx);
        const active = await this.activeAccess(tx, orderId, now);
        if (active)
          throw new ConflictException(
            'This order already has active customer access',
          );
        if (input.expectedAccessId)
          throw new ConflictException('Customer access state has changed');
        const expired = await tx.orderCustomerAccess.findFirst({
          where: {
            expiresAt: { lte: now },
            rentalOrderId: orderId,
            revokedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (expired) {
          await tx.orderCustomerAccess.update({
            where: { id: expired.id },
            data: { revokedAt: now },
          });
          await tx.rentalOrderActivity.create({
            data: {
              actorUserId: actor.id,
              rentalOrderId: orderId,
              type: RentalOrderActivityType.ORDER_CUSTOMER_ACCESS_REVOKED,
            },
          });
        }
        const access = await this.createAccess(
          tx,
          actor.id,
          orderId,
          input.operationId,
          payloadHash,
          now,
        );
        await tx.rentalOrderActivity.create({
          data: {
            actorUserId: actor.id,
            rentalOrderId: orderId,
            type: RentalOrderActivityType.ORDER_CUSTOMER_ACCESS_CREATED,
          },
        });
        return this.accessMutationResponse(access, true);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeCustomerAccess(
    actor: StaffUserResponse,
    orderId: string,
    input: OrderAccessOperationInput,
  ): Promise<AdminCustomerAccessMutationResponse> {
    return prisma.$transaction(
      async (tx) => {
        await this.requireActor(tx, actor.id, ['order.view', 'order.update']);
        await this.lockOrder(tx, orderId);
        const payloadHash = this.hash({
          action: 'revoke',
          expectedAccessId: input.expectedAccessId ?? null,
          orderId,
        });
        const replay = await tx.rentalOrderActivity.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          this.assertActivityReplay(replay, actor.id, orderId, payloadHash);
          const revokedAccess = input.expectedAccessId
            ? await tx.orderCustomerAccess.findUnique({
                where: { id: input.expectedAccessId },
              })
            : null;
          if (!revokedAccess || revokedAccess.rentalOrderId !== orderId)
            throw new ConflictException('Customer access state has changed');
          return this.accessMutationResponse(revokedAccess, false);
        }
        await this.rejectAccessOperationReuse(tx, input.operationId);
        const now = await this.databaseNow(tx);
        const active = await this.requireExpectedActiveAccess(
          tx,
          orderId,
          input.expectedAccessId,
          now,
        );
        await tx.orderCustomerAccess.update({
          where: { id: active.id },
          data: { revokedAt: now },
        });
        await tx.rentalOrderActivity.create({
          data: {
            actorUserId: actor.id,
            operationId: input.operationId,
            payloadHash,
            rentalOrderId: orderId,
            type: RentalOrderActivityType.ORDER_CUSTOMER_ACCESS_REVOKED,
          },
        });
        return {
          access: this.mapAccessStatus({ ...active, revokedAt: now }, now),
          accessLink: null,
          deliveryMode: null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async rotateCustomerAccess(
    actor: StaffUserResponse,
    orderId: string,
    input: OrderAccessOperationInput,
  ): Promise<AdminCustomerAccessMutationResponse> {
    return prisma.$transaction(
      async (tx) => {
        await this.requireActor(tx, actor.id, ['order.view', 'order.update']);
        await this.lockOrder(tx, orderId);
        const payloadHash = this.hash({
          action: 'rotate',
          expectedAccessId: input.expectedAccessId ?? null,
          orderId,
        });
        const replay = await tx.orderCustomerAccess.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay)
          return this.replayAccessMutation(
            replay,
            actor.id,
            orderId,
            payloadHash,
            true,
          );
        await this.rejectActivityOperationReuse(tx, input.operationId);
        const now = await this.databaseNow(tx);
        const active = await this.requireExpectedActiveAccess(
          tx,
          orderId,
          input.expectedAccessId,
          now,
        );
        await tx.orderCustomerAccess.update({
          where: { id: active.id },
          data: { revokedAt: now },
        });
        const replacement = await this.createAccess(
          tx,
          actor.id,
          orderId,
          input.operationId,
          payloadHash,
          now,
        );
        await tx.rentalOrderActivity.create({
          data: {
            actorUserId: actor.id,
            rentalOrderId: orderId,
            type: RentalOrderActivityType.ORDER_CUSTOMER_ACCESS_ROTATED,
          },
        });
        return this.accessMutationResponse(replacement, true);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resendCustomerAccess(
    actor: StaffUserResponse,
    orderId: string,
    input: OrderAccessOperationInput,
  ): Promise<AdminCustomerAccessMutationResponse> {
    return prisma.$transaction(
      async (tx) => {
        await this.requireActor(tx, actor.id, ['order.view', 'order.update']);
        await this.lockOrder(tx, orderId);
        const payloadHash = this.hash({
          action: 'resend',
          expectedAccessId: input.expectedAccessId ?? null,
          orderId,
        });
        const replay = await tx.rentalOrderActivity.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          this.assertActivityReplay(replay, actor.id, orderId, payloadHash);
          const now = await this.databaseNow(tx);
          const active = await this.requireExpectedActiveAccess(
            tx,
            orderId,
            input.expectedAccessId,
            now,
          );
          return this.accessMutationResponse(active, true);
        }
        await this.rejectAccessOperationReuse(tx, input.operationId);
        const now = await this.databaseNow(tx);
        const active = await this.requireExpectedActiveAccess(
          tx,
          orderId,
          input.expectedAccessId,
          now,
        );
        await tx.rentalOrderActivity.create({
          data: {
            actorUserId: actor.id,
            operationId: input.operationId,
            payloadHash,
            rentalOrderId: orderId,
            type: RentalOrderActivityType.ORDER_CUSTOMER_ACCESS_RESENT,
          },
        });
        return this.accessMutationResponse(active, true);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async validateCapability(raw: string) {
    const access = await this.access(raw);
    return { expiresAt: access.expiresAt.toISOString() };
  }

  async publicCurrent(raw: string): Promise<PublicRentalOrderResponse> {
    const access = await this.access(raw);
    return this.mapPublic(access.rentalOrder);
  }

  async markViewed(raw: string): Promise<PublicRentalOrderResponse> {
    const initial = await this.access(raw);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "OrderCustomerAccess" WHERE "id"=${initial.id}::uuid FOR UPDATE`;
      const access = await tx.orderCustomerAccess.findUnique({
        where: { id: initial.id },
      });
      if (
        !access ||
        access.revokedAt ||
        access.expiresAt <= (await this.databaseNow(tx))
      )
        throw unavailable();
      if (!access.firstViewedAt) {
        const now = await this.databaseNow(tx);
        await tx.orderCustomerAccess.update({
          where: { id: access.id },
          data: { firstViewedAt: now },
        });
        await tx.rentalOrderActivity.create({
          data: {
            rentalOrderId: access.rentalOrderId,
            type: RentalOrderActivityType.ORDER_VIEWED,
          },
        });
      }
    });
    return this.publicCurrent(raw);
  }

  async staffPdf(id: string) {
    const order = await prisma.rentalOrder.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Rental order not found');
    return this.buildPdf(order);
  }

  async publicPdf(raw: string) {
    const access = await this.access(raw);
    return this.buildPdf(access.rentalOrder);
  }

  private async access(raw: string) {
    const access = await prisma.orderCustomerAccess.findUnique({
      where: { tokenHash: this.hash(raw) },
      include: { rentalOrder: { include: orderInclude } },
    });
    if (
      !access ||
      !this.validRaw(raw, access.id, access.rentalOrderId) ||
      access.revokedAt ||
      access.expiresAt <= new Date()
    )
      throw unavailable();
    return access;
  }

  private mapSummary(order: {
    chargeTotalCents: bigint;
    confirmedAt: Date;
    contactFirstNameSnapshot: string;
    contactLastNameSnapshot: string;
    discountBaseCents: bigint;
    discountCents: bigint;
    discountRateBasisPoints: number | null;
    discountType: 'FIXED_AMOUNT' | 'PERCENTAGE';
    fulfillmentMethodSnapshot: AdminRentalOrderSummaryResponse['fulfillmentMethod'];
    id: string;
    itemSubtotalCents: bigint;
    orderNumber: string;
    quoteId: string;
    quote: { quoteNumber: string };
    rentalEndDateSnapshot: Date;
    rentalRequestId: string;
    rentalRequest: { referenceNumber: string };
    rentalStartDateSnapshot: Date;
    reservationStatus: 'NOT_RESERVED';
    status: 'CONFIRMED';
    subtotalCents: bigint;
    taxCents: bigint;
    taxableSubtotalCents: bigint;
    totalCents: bigint;
  }): AdminRentalOrderSummaryResponse {
    return {
      chargeTotalCents: this.safeNumber(order.chargeTotalCents),
      confirmedAt: order.confirmedAt.toISOString(),
      customerName: `${order.contactFirstNameSnapshot} ${order.contactLastNameSnapshot}`,
      discountBaseCents: this.safeNumber(order.discountBaseCents),
      discountCents: this.safeNumber(order.discountCents),
      discountRateBasisPoints: order.discountRateBasisPoints,
      discountType: order.discountType,
      fulfillmentMethod: order.fulfillmentMethodSnapshot,
      id: order.id,
      itemSubtotalCents: this.safeNumber(order.itemSubtotalCents),
      orderNumber: order.orderNumber,
      quoteId: order.quoteId,
      quoteNumber: order.quote.quoteNumber,
      rentalEndDate: this.dateOnly(order.rentalEndDateSnapshot),
      rentalRequestId: order.rentalRequestId,
      rentalRequestReference: order.rentalRequest.referenceNumber,
      rentalStartDate: this.dateOnly(order.rentalStartDateSnapshot),
      reservationStatus: order.reservationStatus,
      status: order.status,
      subtotalCents: this.safeNumber(order.subtotalCents),
      taxableSubtotalCents: this.safeNumber(order.taxableSubtotalCents),
      taxCents: this.safeNumber(order.taxCents),
      totalCents: this.safeNumber(order.totalCents),
    };
  }

  private mapDetail(order: OrderRecord): AdminRentalOrderDetailResponse {
    return {
      ...this.mapSummary(order),
      acceptedQuoteRevisionId: order.acceptedQuoteRevisionId,
      acceptedRevisionNumber: order.acceptedRevisionNumber,
      activities: order.activities.map((activity) => ({
        actor: activity.actor,
        createdAt: activity.createdAt.toISOString(),
        id: activity.id,
        type: activity.type,
      })),
      charges: order.charges.map((charge) => ({
        amountCents: this.safeNumber(charge.amountCents),
        id: charge.id,
        label: charge.label,
        sortOrder: charge.sortOrder,
        taxable: charge.taxable,
        type: charge.type,
      })),
      confirmedBy: order.confirmedBy,
      currency: 'CAD',
      customer: {
        companyName: order.companyNameSnapshot,
        email: order.contactEmailSnapshot,
        firstName: order.contactFirstNameSnapshot,
        lastName: order.contactLastNameSnapshot,
        phone: order.contactPhoneSnapshot,
      },
      deliveryAddress: order.deliveryAddressSnapshot,
      discountTaxable: order.discountTaxable,
      taxableDiscountCents: this.safeNumber(order.taxableDiscountCents),
      customerAccess: this.mapAccessStatus(
        order.customerAccess[0] ?? null,
        new Date(),
      ),
      items: order.items.map((item) => ({
        approvedQuantity: item.approvedQuantitySnapshot,
        categoryName: item.categoryNameSnapshot,
        categorySlug: item.categorySlugSnapshot,
        sourceQuoteRevisionItemId: item.sourceQuoteRevisionItemId,
        id: item.id,
        lineSubtotalCents: this.safeNumber(item.lineSubtotalCents),
        productName: item.productNameSnapshot,
        productSlug: item.productSlugSnapshot,
        quotedQuantity: item.quotedQuantity,
        rentalUnit: item.rentalUnitSnapshot,
        sortOrder: item.sortOrder,
        taxable: item.taxable,
        unitPriceCents: this.safeNumber(item.unitPriceCents),
      })),
      notice,
      project: {
        customerNotes: order.requestCustomerNotesSnapshot,
        location: order.projectLocationSnapshot,
        name: order.projectNameSnapshot,
        requestedTimeZone: order.requestedTimeZoneSnapshot,
        type: order.projectTypeSnapshot,
      },
      quoteCustomerNotes: order.quoteCustomerNotesSnapshot,
      rentalRequestDecisionId: order.rentalRequestDecisionId,
      tax: {
        name: order.tax!.name,
        rateBasisPoints: order.tax!.rateBasisPoints,
        taxAmountCents: this.safeNumber(order.tax!.taxAmountCents),
        taxableAmountCents: this.safeNumber(order.tax!.taxableAmountCents),
      },
      terms: order.termsSnapshot,
    };
  }

  private mapPublic(order: OrderRecord): PublicRentalOrderResponse {
    const detail = this.mapDetail(order);
    return {
      chargeTotalCents: detail.chargeTotalCents,
      charges: detail.charges.map(({ amountCents, label, taxable, type }) => ({
        amountCents,
        label,
        taxable,
        type,
      })),
      companyName: detail.customer.companyName,
      confirmedAt: detail.confirmedAt,
      currency: 'CAD',
      customerName: detail.customerName,
      customerNotes: detail.quoteCustomerNotes,
      deliveryAddress: detail.deliveryAddress,
      discountCents: detail.discountCents,
      discountBaseCents: detail.discountBaseCents,
      discountRateBasisPoints: detail.discountRateBasisPoints,
      discountType: detail.discountType,
      fulfillmentMethod: detail.fulfillmentMethod,
      itemSubtotalCents: detail.itemSubtotalCents,
      items: detail.items.map(
        ({
          approvedQuantity,
          lineSubtotalCents,
          productName,
          productSlug,
          quotedQuantity,
          rentalUnit,
          taxable,
          unitPriceCents,
        }) => ({
          approvedQuantity,
          lineSubtotalCents,
          productName,
          productSlug,
          quotedQuantity,
          rentalUnit,
          taxable,
          unitPriceCents,
        }),
      ),
      notice,
      orderNumber: detail.orderNumber,
      projectLocation: detail.project.location,
      projectName: detail.project.name,
      projectNotes: detail.project.customerNotes,
      projectType: detail.project.type,
      rentalEndDate: detail.rentalEndDate,
      rentalStartDate: detail.rentalStartDate,
      reservationStatus: 'NOT_RESERVED',
      status: 'CONFIRMED',
      subtotalCents: detail.subtotalCents,
      tax: detail.tax,
      taxableSubtotalCents: detail.taxableSubtotalCents,
      taxCents: detail.taxCents,
      terms: detail.terms,
      totalCents: detail.totalCents,
    };
  }

  private buildPdf(order: OrderRecord) {
    const detail = this.mapPublic(order);
    const money = (value: number) =>
      new Intl.NumberFormat('en-CA', {
        currency: detail.currency,
        style: 'currency',
      }).format(value / 100);
    const discount =
      detail.discountType === 'PERCENTAGE'
        ? `${((detail.discountRateBasisPoints ?? 0) / 100).toFixed(2)}% (${money(detail.discountCents)})`
        : money(detail.discountCents);
    const lines = [
      `Order number: ${detail.orderNumber}`,
      `Status: ${detail.status}`,
      `Confirmed: ${detail.confirmedAt}`,
      `Customer: ${detail.customerName}${detail.companyName ? ` (${detail.companyName})` : ''}`,
      `Project: ${detail.projectName}`,
      `Project type: ${detail.projectType}`,
      `Project location: ${detail.projectLocation}`,
      `Rental dates: ${detail.rentalStartDate} to ${detail.rentalEndDate}`,
      `Fulfillment: ${detail.fulfillmentMethod}`,
      ...(detail.deliveryAddress
        ? [`Delivery address: ${detail.deliveryAddress}`]
        : []),
      '',
      'Items',
      ...detail.items.map(
        (item) =>
          `${item.productName} | ${item.quotedQuantity} ${item.rentalUnit} x ${money(item.unitPriceCents)} = ${money(item.lineSubtotalCents)}`,
      ),
      ...(detail.charges.length
        ? [
            '',
            'Charges',
            ...detail.charges.map(
              (charge) => `${charge.label}: ${money(charge.amountCents)}`,
            ),
          ]
        : []),
      '',
      `Items subtotal: ${money(detail.itemSubtotalCents)}`,
      `Charges total: ${money(detail.chargeTotalCents)}`,
      `Discount: ${discount}`,
      `Tax (${detail.tax.name} ${(detail.tax.rateBasisPoints / 100).toFixed(2)}%): ${money(detail.taxCents)}`,
      `Total: ${money(detail.totalCents)} ${detail.currency}`,
      ...(detail.terms ? ['', 'Terms', detail.terms] : []),
      '',
      detail.notice,
    ];
    return {
      buffer: buildSelectableTextPdf({
        lines,
        title: 'Mensah Rentals - Confirmed Rental Order',
      }),
      filename: safePdfFilename('mensah-rentals-order', detail.orderNumber),
    };
  }

  private verifyMoney(revision: {
    chargeTotalCents: bigint;
    charges: Array<{ amountCents: bigint; taxable: boolean }>;
    discountCents: bigint;
    discountBaseCents: bigint;
    discountRateBasisPoints: number | null;
    discountTaxable: boolean;
    discountType: 'FIXED_AMOUNT' | 'PERCENTAGE';
    itemSubtotalCents: bigint;
    items: Array<{
      lineSubtotalCents: bigint;
      quotedQuantity: number;
      taxable: boolean;
      unitPriceCents: bigint;
    }>;
    subtotalCents: bigint;
    tax: {
      rateBasisPoints: number;
      taxAmountCents: bigint;
      taxableAmountCents: bigint;
    } | null;
    taxableSubtotalCents: bigint;
    taxableDiscountCents: bigint;
    taxCents: bigint;
    totalCents: bigint;
  }) {
    if (!revision.tax)
      throw new ConflictException('Accepted quote tax snapshot is missing');
    for (const item of revision.items)
      if (
        item.lineSubtotalCents !==
        BigInt(item.quotedQuantity) * item.unitPriceCents
      )
        throw new ConflictException(
          'Accepted quote money snapshot is inconsistent',
        );
    const totals = calculateQuoteMoney({
      items: revision.items.map((item) => ({
        quantity: item.quotedQuantity,
        taxable: item.taxable,
        unitPriceCents: this.safeNumber(item.unitPriceCents),
      })),
      charges: revision.charges.map((charge) => ({
        amountCents: this.safeNumber(charge.amountCents),
        taxable: charge.taxable,
      })),
      discountCents: this.safeNumber(revision.discountCents),
      discountTaxable: revision.discountTaxable,
      discountType: revision.discountType,
      discountRateBasisPoints: revision.discountRateBasisPoints,
      taxRateBasisPoints: revision.tax.rateBasisPoints,
    });
    if (
      totals.itemSubtotalCents !== revision.itemSubtotalCents ||
      totals.chargeTotalCents !== revision.chargeTotalCents ||
      totals.subtotalCents !== revision.subtotalCents ||
      totals.discountBaseCents !== revision.discountBaseCents ||
      totals.discountCents !== revision.discountCents ||
      totals.taxableDiscountCents !== revision.taxableDiscountCents ||
      totals.taxableSubtotalCents !== revision.taxableSubtotalCents ||
      totals.taxCents !== revision.taxCents ||
      totals.taxCents !== revision.tax.taxAmountCents ||
      totals.taxableSubtotalCents !== revision.tax.taxableAmountCents ||
      totals.totalCents !== revision.totalCents
    )
      throw new ConflictException(
        'Accepted quote money snapshot is inconsistent',
      );
  }

  private async createAccess(
    tx: Prisma.TransactionClient,
    actorId: string,
    orderId: string,
    operationId: string,
    payloadHash: string,
    now: Date,
  ) {
    const id = randomUUID();
    const raw = this.rawCapability(id, orderId);
    return tx.orderCustomerAccess.create({
      data: {
        createdByUserId: actorId,
        expiresAt: new Date(
          now.valueOf() +
            this.config.get('PUBLIC_ORDER_ACCESS_TTL_DAYS', { infer: true }) *
              86_400_000,
        ),
        id,
        operationId,
        payloadHash,
        rentalOrderId: orderId,
        tokenHash: this.hash(raw),
      },
    });
  }

  private async activeAccess(
    tx: Prisma.TransactionClient,
    orderId: string,
    now: Date,
  ) {
    return tx.orderCustomerAccess.findFirst({
      where: {
        expiresAt: { gt: now },
        rentalOrderId: orderId,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireExpectedActiveAccess(
    tx: Prisma.TransactionClient,
    orderId: string,
    expectedAccessId: string | undefined,
    now: Date,
  ) {
    const active = await this.activeAccess(tx, orderId, now);
    if (!active || !expectedAccessId || active.id !== expectedAccessId)
      throw new ConflictException('Customer access state has changed');
    return active;
  }

  private accessMutationResponse(
    access: Prisma.OrderCustomerAccessGetPayload<Record<string, never>>,
    revealLink: boolean,
  ): AdminCustomerAccessMutationResponse {
    const status = this.mapAccessStatus(access, new Date());
    const mayReveal = revealLink && status.state === 'ACTIVE';
    return {
      access: status,
      accessLink: mayReveal
        ? `${this.config.get('WEB_ORIGIN', { infer: true })}/order/access#capability=${this.rawCapability(access.id, access.rentalOrderId)}`
        : null,
      deliveryMode: mayReveal ? 'SECURE_TEST_LINK' : null,
    };
  }

  private async replayAccessMutation(
    access: Prisma.OrderCustomerAccessGetPayload<Record<string, never>>,
    actorId: string,
    orderId: string,
    payloadHash: string,
    revealLink: boolean,
  ) {
    if (
      access.createdByUserId !== actorId ||
      access.rentalOrderId !== orderId ||
      access.payloadHash !== payloadHash
    )
      throw new ConflictException(
        'Operation identifier was reused differently',
      );
    return this.accessMutationResponse(access, revealLink);
  }

  private assertActivityReplay(
    activity: {
      actorUserId: string | null;
      payloadHash: string | null;
      rentalOrderId: string;
    },
    actorId: string,
    orderId: string,
    payloadHash: string,
  ) {
    if (
      activity.actorUserId !== actorId ||
      activity.rentalOrderId !== orderId ||
      activity.payloadHash !== payloadHash
    )
      throw new ConflictException(
        'Operation identifier was reused differently',
      );
  }

  private async rejectActivityOperationReuse(
    tx: Prisma.TransactionClient,
    operationId: string,
  ) {
    if (
      await tx.rentalOrderActivity.findUnique({
        where: { operationId },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'Operation identifier was reused differently',
      );
  }

  private async rejectAccessOperationReuse(
    tx: Prisma.TransactionClient,
    operationId: string,
  ) {
    if (
      await tx.orderCustomerAccess.findUnique({
        where: { operationId },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'Operation identifier was reused differently',
      );
  }

  private mapAccessStatus(
    access: {
      createdAt: Date;
      expiresAt: Date;
      firstViewedAt: Date | null;
      id: string;
      revokedAt: Date | null;
    } | null,
    now: Date,
  ) {
    return access
      ? {
          accessId: access.id,
          createdAt: access.createdAt.toISOString(),
          expiresAt: access.expiresAt.toISOString(),
          firstViewedAt: access.firstViewedAt?.toISOString() ?? null,
          state: access.revokedAt
            ? ('REVOKED' as const)
            : access.expiresAt <= now
              ? ('EXPIRED' as const)
              : ('ACTIVE' as const),
        }
      : {
          accessId: null,
          createdAt: null,
          expiresAt: null,
          firstViewedAt: null,
          state: 'NONE' as const,
        };
  }

  private rawCapability(accessId: string, orderId: string) {
    const signature = createHmac(
      'sha256',
      this.config.get('PUBLIC_ORDER_ACCESS_SECRET', { infer: true }),
    )
      .update(`${accessId}:${orderId}`)
      .digest('base64url');
    return `${accessId}.${signature}`;
  }
  private validRaw(raw: string, accessId: string, orderId: string) {
    const expected = Buffer.from(this.rawCapability(accessId, orderId));
    const actual = Buffer.from(raw);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
  private hash(value: unknown) {
    return createHash('sha256')
      .update(typeof value === 'string' ? value : JSON.stringify(value))
      .digest('hex');
  }
  private cuidLike() {
    return `c${randomBytes(12).toString('hex')}`;
  }
  private orderNumber() {
    return `RO-${randomBytes(10).toString('hex').toUpperCase()}`;
  }
  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
  private safeNumber(value: bigint) {
    const result = Number(value);
    if (!Number.isSafeInteger(result)) throw new Error('Unsafe order amount');
    return result;
  }
  private code(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
  private isOrderNumberCollision(error: unknown) {
    if (this.code(error) !== 'P2002') return false;
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    return Array.isArray(target)
      ? target.includes('orderNumber')
      : String(target).includes('orderNumber');
  }
  private async lockQuote(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Quote" WHERE "id"=${id} FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Quote not found');
  }
  private async lockRentalRequest(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RentalRequest" WHERE "id"=${id} FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Rental request not found');
  }
  private async lockOrderForRequest(
    tx: Prisma.TransactionClient,
    rentalRequestId: string,
  ) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RentalOrder"
      WHERE "rentalRequestId"=${rentalRequestId}
      FOR UPDATE
    `;
  }
  private async lockOrder(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RentalOrder" WHERE "id"=${id} FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Rental order not found');
  }
  private async databaseNow(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`
      SELECT CURRENT_TIMESTAMP AS "now"
    `;
    return row!.now;
  }
  private async requireActor(
    tx: Prisma.TransactionClient,
    actorId: string,
    permissions: string[],
  ) {
    if (
      !(await tx.user.findFirst({
        where: { id: actorId, status: UserStatus.ACTIVE },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('Insufficient permissions');
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
}
