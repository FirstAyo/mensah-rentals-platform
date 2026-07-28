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
  PaginatedResponse,
  PublicRentalOrderResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import {
  calculateQuoteMoney,
  type ApiEnvironment,
  type CreateRentalOrderInput,
  type RentalOrderListQuery,
} from '@mensah-rentals/validation';

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
            await this.lockQuote(tx, quoteId);
            const replay = await tx.rentalOrder.findUnique({
              where: { operationId: input.operationId },
              include: { customerAccess: true },
            });
            if (replay) {
              if (
                replay.confirmedByUserId === actor.id &&
                replay.quoteId === quoteId &&
                replay.acceptedQuoteRevisionId === revisionId &&
                replay.payloadHash === payloadHash &&
                replay.customerAccess
              )
                return {
                  accessId: replay.customerAccess.id,
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
                rentalRequest: { include: { decision: true } },
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
            const decision = quote.rentalRequest.decision;
            if (
              lifecycle?.state !== QuoteRevisionState.ACCEPTED ||
              response?.response !== 'ACCEPTED' ||
              response.respondedAt > revision.validUntil ||
              !lifecycle.terminalAt ||
              !decision ||
              decision.id !== revision.rentalRequestDecisionId ||
              decision.rentalRequestId !== quote.rentalRequestId ||
              (quote.rentalRequest.status !== RentalRequestStatus.APPROVED &&
                quote.rentalRequest.status !==
                  RentalRequestStatus.PARTIALLY_APPROVED)
            )
              throw new ConflictException(
                'The quote revision is not eligible for order conversion',
              );
            this.verifyMoney(revision);
            const accessId = randomUUID();
            const orderId = this.cuidLike();
            const raw = this.rawCapability(accessId, orderId);
            const now = await this.databaseNow(tx);
            const expiresAt = new Date(
              now.valueOf() +
                this.config.get('PUBLIC_ORDER_ACCESS_TTL_DAYS', {
                  infer: true,
                }) *
                  86_400_000,
            );
            const order = await tx.rentalOrder.create({
              data: {
                id: orderId,
                acceptedQuoteRevisionId: revision.id,
                acceptedRevisionNumber: revision.revisionNumber,
                chargeTotalCents: revision.chargeTotalCents,
                companyNameSnapshot: quote.rentalRequest.companyName,
                confirmedAt: now,
                confirmedByUserId: actor.id,
                contactEmailSnapshot: quote.rentalRequest.contactEmail,
                contactFirstNameSnapshot: quote.rentalRequest.contactFirstName,
                contactLastNameSnapshot: quote.rentalRequest.contactLastName,
                contactPhoneSnapshot: quote.rentalRequest.contactPhone,
                currency: revision.currency,
                deliveryAddressSnapshot: quote.rentalRequest.deliveryAddress,
                discountCents: revision.discountCents,
                discountTaxable: revision.discountTaxable,
                fulfillmentMethodSnapshot:
                  quote.rentalRequest.fulfillmentMethod,
                itemSubtotalCents: revision.itemSubtotalCents,
                operationId: input.operationId,
                orderNumber: this.orderNumber(),
                payloadHash,
                projectLocationSnapshot: quote.rentalRequest.projectLocation,
                projectNameSnapshot: quote.rentalRequest.projectName,
                projectTypeSnapshot: quote.rentalRequest.projectType,
                quoteCustomerNotesSnapshot: revision.customerNotes,
                quoteId,
                rentalEndDateSnapshot: quote.rentalRequest.rentalEndDate,
                rentalRequestDecisionId: decision.id,
                rentalRequestId: quote.rentalRequestId,
                rentalStartDateSnapshot: quote.rentalRequest.rentalStartDate,
                requestCustomerNotesSnapshot: quote.rentalRequest.customerNotes,
                requestedTimeZoneSnapshot:
                  quote.rentalRequest.requestedTimeZone,
                subtotalCents: revision.subtotalCents,
                taxCents: revision.taxCents,
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
                customerAccess: {
                  create: {
                    id: accessId,
                    expiresAt,
                    tokenHash: this.hash(raw),
                  },
                },
                activities: {
                  create: [
                    {
                      actorUserId: actor.id,
                      type: RentalOrderActivityType.ORDER_CREATED,
                    },
                    {
                      actorUserId: actor.id,
                      type: RentalOrderActivityType.ORDER_CUSTOMER_ACCESS_CREATED,
                    },
                  ],
                },
              },
              select: { id: true, orderNumber: true },
            });
            return {
              accessId,
              orderId: order.id,
              orderNumber: order.orderNumber,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        const capability = this.rawCapability(result.accessId, result.orderId);
        return {
          customerAccessLink: `${this.config.get('WEB_ORIGIN', { infer: true })}/order/access#capability=${capability}`,
          order: { id: result.orderId, orderNumber: result.orderNumber },
        };
      } catch (error) {
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
    discountCents: bigint;
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
      discountCents: this.safeNumber(order.discountCents),
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

  private verifyMoney(revision: {
    chargeTotalCents: bigint;
    charges: Array<{ amountCents: bigint; taxable: boolean }>;
    discountCents: bigint;
    discountTaxable: boolean;
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
      taxRateBasisPoints: revision.tax.rateBasisPoints,
    });
    if (
      totals.itemSubtotalCents !== revision.itemSubtotalCents ||
      totals.chargeTotalCents !== revision.chargeTotalCents ||
      totals.subtotalCents !== revision.subtotalCents ||
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
