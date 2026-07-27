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
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  prisma,
  Prisma,
  QuoteActivityType,
  QuoteRevisionState,
  RentalRequestStatus,
  UserStatus,
} from '@mensah-rentals/database';
import type {
  AdminQuoteDetailResponse,
  AdminQuoteRevisionResponse,
  AdminQuoteSendResponse,
  AdminQuoteSummaryResponse,
  PaginatedResponse,
  PublicQuoteResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import {
  calculateQuoteMoney,
  type ApiEnvironment,
  type QuoteCustomerResponseInput,
  type QuoteListQuery,
  type QuoteRevisionInput,
  type SendQuoteRevisionInput,
} from '@mensah-rentals/validation';

const unavailable = () => new NotFoundException('Quote is unavailable');
const notice =
  'This quote is not a confirmed rental order. Inventory is not reserved until a later confirmed workflow stage.';

const revisionInclude = {
  charges: { orderBy: { sortOrder: 'asc' as const } },
  createdBy: { select: { firstName: true, id: true, lastName: true } },
  customerResponse: true,
  items: { orderBy: { sortOrder: 'asc' as const } },
  lifecycle: true,
  tax: true,
} satisfies Prisma.QuoteRevisionInclude;

type RevisionRecord = Prisma.QuoteRevisionGetPayload<{
  include: typeof revisionInclude;
}>;

@Injectable()
export class QuoteService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  async list(
    query: QuoteListQuery,
  ): Promise<PaginatedResponse<AdminQuoteSummaryResponse>> {
    const now = new Date();
    const latestRevision: Prisma.QuoteRevisionWhereInput = {
      ...(query.status === QuoteRevisionState.EXPIRED
        ? {
            OR: [
              { lifecycle: { state: QuoteRevisionState.EXPIRED } },
              {
                lifecycle: {
                  state: {
                    in: [QuoteRevisionState.SENT, QuoteRevisionState.VIEWED],
                  },
                },
                validUntil: { lte: now },
              },
            ],
          }
        : query.status
          ? {
              lifecycle: { state: query.status },
              ...(this.isActionable(query.status)
                ? { validUntil: { gt: now } }
                : {}),
            }
          : {}),
      ...(query.validUntilFrom || query.validUntilTo
        ? {
            validUntil: {
              ...(query.validUntilFrom
                ? { gte: new Date(query.validUntilFrom) }
                : {}),
              ...(query.validUntilTo
                ? { lte: new Date(query.validUntilTo) }
                : {}),
            },
          }
        : {}),
    };
    const where: Prisma.QuoteWhereInput = {
      ...(query.createdByUserId
        ? { createdByUserId: query.createdByUserId }
        : {}),
      ...(query.search
        ? {
            OR: [
              { quoteNumber: { contains: query.search, mode: 'insensitive' } },
              {
                rentalRequest: {
                  referenceNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                rentalRequest: {
                  contactEmail: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                rentalRequest: {
                  contactFirstName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                rentalRequest: {
                  contactLastName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
      ...(Object.keys(latestRevision).length > 0 ? { latestRevision } : {}),
    };
    const orderBy: Prisma.QuoteOrderByWithRelationInput =
      query.sortBy === 'total'
        ? { latestRevision: { totalCents: query.sortDirection } }
        : query.sortBy === 'validUntil'
          ? { latestRevision: { validUntil: query.sortDirection } }
          : { createdAt: query.sortDirection };
    const [rows, total] = await prisma.$transaction([
      prisma.quote.findMany({
        where,
        orderBy: [orderBy, { id: query.sortDirection }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          latestRevision: { include: { lifecycle: true } },
          rentalRequest: true,
        },
      }),
      prisma.quote.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        customerName: `${row.rentalRequest.contactFirstName} ${row.rentalRequest.contactLastName}`,
        id: row.id,
        quoteNumber: row.quoteNumber,
        rentalRequestId: row.rentalRequestId,
        rentalRequestReference: row.rentalRequest.referenceNumber,
        revisionNumber: row.latestRevision!.revisionNumber,
        status: this.effectiveState(row.latestRevision!),
        totalCents: this.safeNumber(row.latestRevision!.totalCents),
        validUntil: row.latestRevision!.validUntil.toISOString(),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async detail(id: string): Promise<AdminQuoteDetailResponse> {
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        rentalRequest: true,
        revisions: {
          include: revisionInclude,
          orderBy: { revisionNumber: 'desc' },
        },
      },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return {
      createdAt: quote.createdAt.toISOString(),
      customer: {
        companyName: quote.rentalRequest.companyName,
        name: `${quote.rentalRequest.contactFirstName} ${quote.rentalRequest.contactLastName}`,
      },
      customerRevisionId: quote.customerRevisionId,
      id: quote.id,
      latestRevisionId: quote.latestRevisionId!,
      notice,
      quoteNumber: quote.quoteNumber,
      rentalRequest: {
        id: quote.rentalRequest.id,
        referenceNumber: quote.rentalRequest.referenceNumber,
        rentalEndDate: this.dateOnly(quote.rentalRequest.rentalEndDate),
        rentalStartDate: this.dateOnly(quote.rentalRequest.rentalStartDate),
      },
      revisions: quote.revisions.map((revision) => this.mapRevision(revision)),
    };
  }

  async createFirst(
    actor: StaffUserResponse,
    requestId: string,
    input: QuoteRevisionInput,
  ) {
    const normalized = this.normalizedInput(input);
    const payloadHash = this.hash({
      action: 'first',
      requestId,
      ...normalized,
    });
    try {
      const quoteId = await prisma.$transaction(async (tx) => {
        await this.requireActor(tx, actor.id, [
          'rental_request.view',
          'quote.create',
        ]);
        await this.lockRequest(tx, requestId);
        const replay = await tx.quoteRevision.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          if (
            replay.createdByUserId === actor.id &&
            replay.payloadHash === payloadHash
          )
            return replay.quoteId;
          throw new ConflictException(
            'Operation identifier was reused differently',
          );
        }
        const request = await tx.rentalRequest.findUnique({
          where: { id: requestId },
          include: {
            decision: {
              include: { items: { include: { rentalRequestItem: true } } },
            },
          },
        });
        if (!request) throw new NotFoundException('Rental request not found');
        if (
          (request.status !== RentalRequestStatus.APPROVED &&
            request.status !== RentalRequestStatus.PARTIALLY_APPROVED) ||
          !request.decision
        )
          throw new ConflictException(
            'Only an approved or partially approved request can be quoted',
          );
        if (
          await tx.quote.findUnique({ where: { rentalRequestId: requestId } })
        )
          throw new ConflictException(
            'This rental request already has a quote',
          );
        const quote = await tx.quote.create({
          data: {
            createdByUserId: actor.id,
            quoteNumber: `QT-${randomBytes(6).toString('hex').toUpperCase()}`,
            rentalRequestId: requestId,
          },
        });
        const revisionId = await this.insertRevision(
          tx,
          quote.id,
          1,
          request.decision,
          actor.id,
          input,
          payloadHash,
        );
        await tx.quote.update({
          where: { id: quote.id },
          data: { latestRevisionId: revisionId },
        });
        await tx.quoteActivity.createMany({
          data: [
            {
              actorUserId: actor.id,
              quoteId: quote.id,
              quoteRevisionId: revisionId,
              type: QuoteActivityType.QUOTE_CREATED,
            },
            {
              actorUserId: actor.id,
              quoteId: quote.id,
              quoteRevisionId: revisionId,
              type: QuoteActivityType.QUOTE_REVISION_CREATED,
            },
          ],
        });
        return quote.id;
      });
      return this.detail(quoteId);
    } catch (error) {
      if (this.code(error) === 'P2002')
        throw new ConflictException('The quote or operation already exists');
      throw error;
    }
  }

  async createRevision(
    actor: StaffUserResponse,
    quoteId: string,
    input: QuoteRevisionInput,
  ) {
    if (input.expectedLatestRevisionNumber === undefined)
      throw new UnprocessableEntityException(
        'Expected latest revision number is required',
      );
    const normalized = this.normalizedInput(input);
    const payloadHash = this.hash({
      action: 'revision',
      quoteId,
      ...normalized,
    });
    try {
      const id = await prisma.$transaction(async (tx) => {
        await this.requireActor(tx, actor.id, ['quote.view', 'quote.update']);
        await this.lockQuote(tx, quoteId);
        const replay = await tx.quoteRevision.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          if (
            replay.createdByUserId === actor.id &&
            replay.quoteId === quoteId &&
            replay.payloadHash === payloadHash
          )
            return replay.id;
          throw new ConflictException(
            'Operation identifier was reused differently',
          );
        }
        const quote = await tx.quote.findUnique({
          where: { id: quoteId },
          include: {
            latestRevision: { include: { lifecycle: true } },
            rentalRequest: {
              include: {
                decision: {
                  include: { items: { include: { rentalRequestItem: true } } },
                },
              },
            },
          },
        });
        if (!quote?.latestRevision || !quote.rentalRequest.decision)
          throw new NotFoundException('Quote not found');
        if (
          quote.latestRevision.revisionNumber !==
          input.expectedLatestRevisionNumber
        )
          throw new ConflictException(
            'The quote changed. Refresh and try again.',
          );
        if (
          quote.latestRevision.lifecycle?.state === QuoteRevisionState.ACCEPTED
        )
          throw new ConflictException(
            'An accepted quote cannot be revised in this phase',
          );
        if (
          quote.latestRevision.lifecycle?.state === QuoteRevisionState.DRAFT
        ) {
          const now = await this.databaseNow(tx);
          await tx.quoteRevisionLifecycle.update({
            where: { quoteRevisionId: quote.latestRevision.id },
            data: {
              state: QuoteRevisionState.SUPERSEDED,
              terminalAt: now,
              lifecycleVersion: { increment: 1 },
            },
          });
        }
        const revisionNumber = quote.latestRevision.revisionNumber + 1;
        const revisionId = await this.insertRevision(
          tx,
          quote.id,
          revisionNumber,
          quote.rentalRequest.decision,
          actor.id,
          input,
          payloadHash,
        );
        await tx.quote.update({
          where: { id: quote.id },
          data: { latestRevisionId: revisionId },
        });
        await tx.quoteActivity.create({
          data: {
            actorUserId: actor.id,
            quoteId,
            quoteRevisionId: revisionId,
            type: QuoteActivityType.QUOTE_REVISION_CREATED,
          },
        });
        return revisionId;
      });
      return this.revisionById(id);
    } catch (error) {
      if (this.code(error) === 'P2002')
        throw new ConflictException('The revision or operation already exists');
      throw error;
    }
  }

  async send(
    actor: StaffUserResponse,
    quoteId: string,
    revisionId: string,
    input: SendQuoteRevisionInput,
  ): Promise<AdminQuoteSendResponse> {
    const payloadHash = this.hash({
      action: 'send',
      quoteId,
      revisionId,
      expectedLifecycleVersion: input.expectedLifecycleVersion,
    });
    const result = await prisma.$transaction(async (tx) => {
      await this.requireActor(tx, actor.id, ['quote.view', 'quote.send']);
      await this.lockQuote(tx, quoteId);
      const replay = await tx.quoteActivity.findUnique({
        where: { operationId: input.operationId },
      });
      if (replay) {
        if (
          replay.actorUserId === actor.id &&
          replay.quoteId === quoteId &&
          replay.quoteRevisionId === revisionId &&
          replay.type === QuoteActivityType.QUOTE_SENT &&
          replay.payloadHash === payloadHash
        ) {
          const access = await tx.quoteCustomerAccess.findUniqueOrThrow({
            where: { quoteRevisionId: revisionId },
          });
          return { accessId: access.id, expiresAt: access.expiresAt };
        }
        throw new ConflictException(
          'Operation identifier was reused differently',
        );
      }
      const quote = await tx.quote.findUnique({
        where: { id: quoteId },
        include: {
          latestRevision: { include: { lifecycle: true } },
          customerRevision: {
            include: { lifecycle: true, customerAccess: true },
          },
        },
      });
      if (!quote?.latestRevision || quote.latestRevision.id !== revisionId)
        throw new ConflictException('Only the latest revision can be sent');
      if (
        quote.latestRevision.lifecycle?.state !== QuoteRevisionState.DRAFT ||
        quote.latestRevision.lifecycle.lifecycleVersion !==
          input.expectedLifecycleVersion
      )
        throw new ConflictException('This revision is no longer sendable');
      const now = await this.databaseNow(tx);
      if (quote.latestRevision.validUntil <= now)
        throw new ConflictException('An expired draft cannot be sent');
      if (
        quote.customerRevision?.lifecycle &&
        this.isActionable(quote.customerRevision.lifecycle.state)
      ) {
        await tx.quoteRevisionLifecycle.update({
          where: { quoteRevisionId: quote.customerRevision.id },
          data: {
            state: QuoteRevisionState.SUPERSEDED,
            terminalAt: now,
            lifecycleVersion: { increment: 1 },
          },
        });
        if (quote.customerRevision.customerAccess)
          await tx.quoteCustomerAccess.update({
            where: { quoteRevisionId: quote.customerRevision.id },
            data: { revokedAt: now },
          });
        await tx.quoteActivity.create({
          data: {
            quoteId,
            quoteRevisionId: quote.customerRevision.id,
            type: QuoteActivityType.QUOTE_SUPERSEDED,
          },
        });
      }
      const accessId = randomUUID();
      const raw = this.rawCapability(accessId, revisionId);
      const expiresAt = new Date(
        Math.min(
          quote.latestRevision.validUntil.valueOf(),
          now.valueOf() +
            this.config.get('PUBLIC_QUOTE_ACCESS_TTL_DAYS', { infer: true }) *
              86_400_000,
        ),
      );
      await tx.quoteRevisionLifecycle.update({
        where: { quoteRevisionId: revisionId },
        data: {
          state: QuoteRevisionState.SENT,
          sentAt: now,
          sentByUserId: actor.id,
          lifecycleVersion: { increment: 1 },
        },
      });
      await tx.quoteCustomerAccess.create({
        data: {
          id: accessId,
          quoteRevisionId: revisionId,
          tokenHash: this.hash(raw),
          expiresAt,
        },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { customerRevisionId: revisionId },
      });
      await tx.quoteActivity.create({
        data: {
          actorUserId: actor.id,
          operationId: input.operationId,
          payloadHash,
          quoteId,
          quoteRevisionId: revisionId,
          type: QuoteActivityType.QUOTE_SENT,
        },
      });
      return { accessId, expiresAt };
    });
    const capability = this.rawCapability(result.accessId, revisionId);
    return {
      accessLink: `${this.config.get('WEB_ORIGIN', { infer: true })}/quote/access#capability=${capability}`,
      quoteId,
      revisionId,
      status: 'SENT',
    };
  }

  async validateCapability(raw: string) {
    const access = await this.access(raw);
    return { expiresAt: access.expiresAt.toISOString() };
  }

  async publicCurrent(raw: string): Promise<PublicQuoteResponse> {
    const access = await this.access(raw);
    const revision = access.quoteRevision;
    return this.mapPublic(revision, revision.quote);
  }

  async markViewed(raw: string): Promise<PublicQuoteResponse> {
    const access = await this.access(raw);
    await prisma.$transaction(async (tx) => {
      await this.lockQuote(tx, access.quoteRevision.quoteId);
      const current = await this.accessInTransaction(tx, raw);
      if (current.quoteRevision.lifecycle?.state === QuoteRevisionState.SENT) {
        await tx.quoteRevisionLifecycle.update({
          where: { quoteRevisionId: current.quoteRevisionId },
          data: {
            state: QuoteRevisionState.VIEWED,
            viewedAt: await this.databaseNow(tx),
            lifecycleVersion: { increment: 1 },
          },
        });
        await tx.quoteActivity.create({
          data: {
            quoteId: current.quoteRevision.quoteId,
            quoteRevisionId: current.quoteRevisionId,
            type: QuoteActivityType.QUOTE_VIEWED,
          },
        });
      }
    });
    return this.publicCurrent(raw);
  }

  async respond(
    raw: string,
    input: QuoteCustomerResponseInput,
  ): Promise<PublicQuoteResponse> {
    const payloadHash = this.hash({
      action: 'respond',
      note: input.note ?? null,
      response: input.response,
    });
    try {
      const expired = await prisma.$transaction(async (tx) => {
        const initial = await this.accessInTransaction(tx, raw);
        await this.lockQuote(tx, initial.quoteRevision.quoteId);
        const access = await this.accessInTransaction(tx, raw);
        const replay = await tx.quoteCustomerResponse.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay) {
          if (
            replay.quoteRevisionId === access.quoteRevisionId &&
            replay.response === input.response &&
            replay.payloadHash === payloadHash
          )
            return false;
          throw new ConflictException(
            'This response operation was already used differently',
          );
        }
        const lifecycle = access.quoteRevision.lifecycle;
        if (!lifecycle || !this.isActionable(lifecycle.state)) return true;
        const now = await this.databaseNow(tx);
        if (now >= access.expiresAt || now >= access.quoteRevision.validUntil) {
          await tx.quoteRevisionLifecycle.update({
            where: { quoteRevisionId: access.quoteRevisionId },
            data: {
              state: QuoteRevisionState.EXPIRED,
              terminalAt: now,
              lifecycleVersion: { increment: 1 },
            },
          });
          await tx.quoteActivity.create({
            data: {
              quoteId: access.quoteRevision.quoteId,
              quoteRevisionId: access.quoteRevisionId,
              type: QuoteActivityType.QUOTE_EXPIRED,
            },
          });
          return true;
        }
        await tx.quoteCustomerResponse.create({
          data: {
            note: input.note ?? null,
            operationId: input.operationId,
            payloadHash,
            quoteRevisionId: access.quoteRevisionId,
            response: input.response,
          },
        });
        await tx.quoteRevisionLifecycle.update({
          where: { quoteRevisionId: access.quoteRevisionId },
          data: {
            state: input.response,
            terminalAt: now,
            lifecycleVersion: { increment: 1 },
          },
        });
        await tx.quoteActivity.create({
          data: {
            operationId: input.operationId,
            payloadHash,
            quoteId: access.quoteRevision.quoteId,
            quoteRevisionId: access.quoteRevisionId,
            type:
              input.response === 'ACCEPTED'
                ? QuoteActivityType.QUOTE_ACCEPTED
                : QuoteActivityType.QUOTE_REJECTED,
          },
        });
        return false;
      });
      if (expired)
        throw new ConflictException('This quote is no longer actionable');
    } catch (error) {
      if (this.code(error) === 'P2002')
        throw new ConflictException(
          'This quote already has a customer response',
        );
      throw error;
    }
    return this.publicCurrent(raw);
  }

  private async insertRevision(
    tx: Prisma.TransactionClient,
    quoteId: string,
    revisionNumber: number,
    decision: Prisma.RentalRequestDecisionGetPayload<{
      include: { items: { include: { rentalRequestItem: true } } };
    }>,
    actorId: string,
    input: QuoteRevisionInput,
    payloadHash: string,
  ) {
    const positive = decision.items.filter((item) => item.approvedQuantity > 0);
    const submitted = new Map(
      input.items.map((item) => [item.rentalRequestDecisionItemId, item]),
    );
    if (
      submitted.size !== positive.length ||
      positive.some((item) => !submitted.has(item.id))
    )
      throw new UnprocessableEntityException(
        'Every positive approved item must appear exactly once',
      );
    const items = positive.map((decisionItem, sortOrder) => {
      const entered = submitted.get(decisionItem.id)!;
      if (entered.quotedQuantity > decisionItem.approvedQuantity)
        throw new UnprocessableEntityException(
          'Quoted quantity cannot exceed approved quantity',
        );
      return { decisionItem, entered, sortOrder };
    });
    const totals = calculateQuoteMoney({
      items: items.map(({ entered }) => ({
        quantity: entered.quotedQuantity,
        taxable: entered.taxable,
        unitPriceCents: entered.unitPriceCents,
      })),
      charges: input.charges,
      discountCents: input.discountCents,
      discountTaxable: input.discountTaxable,
      taxRateBasisPoints: input.tax.rateBasisPoints,
    });
    if (new Date(input.validUntil) <= (await this.databaseNow(tx)))
      throw new UnprocessableEntityException(
        'Quote validity must end in the future',
      );
    const revision = await tx.quoteRevision.create({
      data: {
        chargeTotalCents: totals.chargeTotalCents,
        createdByUserId: actorId,
        currency: 'CAD',
        customerNotes: input.customerNotes ?? null,
        discountCents: input.discountCents,
        discountTaxable: input.discountTaxable,
        internalNotes: input.internalNotes ?? null,
        itemSubtotalCents: totals.itemSubtotalCents,
        operationId: input.operationId,
        payloadHash,
        quoteId,
        rentalRequestDecisionId: decision.id,
        revisionNumber,
        subtotalCents: totals.subtotalCents,
        taxableSubtotalCents: totals.taxableSubtotalCents,
        taxCents: totals.taxCents,
        terms: input.terms ?? null,
        totalCents: totals.totalCents,
        validUntil: new Date(input.validUntil),
        items: {
          create: items.map(({ decisionItem, entered, sortOrder }) => ({
            approvedQuantitySnapshot: decisionItem.approvedQuantity,
            categoryNameSnapshot: decisionItem.rentalRequestItem.categoryName,
            categorySlugSnapshot: decisionItem.rentalRequestItem.categorySlug,
            lineSubtotalCents:
              BigInt(entered.quotedQuantity) * BigInt(entered.unitPriceCents),
            productIdSnapshot: decisionItem.rentalRequestItem.productId,
            productNameSnapshot: decisionItem.rentalRequestItem.productName,
            productSlugSnapshot: decisionItem.rentalRequestItem.productSlug,
            quotedQuantity: entered.quotedQuantity,
            rentalRequestDecisionItemId: decisionItem.id,
            rentalUnitSnapshot: decisionItem.rentalRequestItem.rentalUnit,
            sortOrder,
            taxable: entered.taxable,
            unitPriceCents: entered.unitPriceCents,
          })),
        },
        charges: {
          create: input.charges.map((charge, sortOrder) => ({
            ...charge,
            sortOrder,
          })),
        },
        tax: {
          create: {
            name: input.tax.name,
            rateBasisPoints: input.tax.rateBasisPoints,
            taxableAmountCents: totals.taxableSubtotalCents,
            taxAmountCents: totals.taxCents,
          },
        },
        lifecycle: { create: {} },
      },
      select: { id: true },
    });
    return revision.id;
  }

  private async revisionById(id: string) {
    const revision = await prisma.quoteRevision.findUniqueOrThrow({
      where: { id },
      include: revisionInclude,
    });
    return this.mapRevision(revision);
  }

  private mapRevision(revision: RevisionRecord): AdminQuoteRevisionResponse {
    return {
      chargeTotalCents: this.safeNumber(revision.chargeTotalCents),
      charges: revision.charges.map((charge) => ({
        amountCents: this.safeNumber(charge.amountCents),
        id: charge.id,
        label: charge.label,
        sortOrder: charge.sortOrder,
        taxable: charge.taxable,
        type: charge.type,
      })),
      createdAt: revision.createdAt.toISOString(),
      createdBy: revision.createdBy,
      currency: 'CAD',
      customerNotes: revision.customerNotes,
      customerResponse: revision.customerResponse
        ? {
            note: revision.customerResponse.note,
            respondedAt: revision.customerResponse.respondedAt.toISOString(),
            response: revision.customerResponse.response,
          }
        : null,
      discountCents: this.safeNumber(revision.discountCents),
      discountTaxable: revision.discountTaxable,
      id: revision.id,
      internalNotes: revision.internalNotes,
      itemSubtotalCents: this.safeNumber(revision.itemSubtotalCents),
      items: revision.items.map((item) => ({
        approvedQuantity: item.approvedQuantitySnapshot,
        categoryName: item.categoryNameSnapshot,
        categorySlug: item.categorySlugSnapshot,
        decisionItemId: item.rentalRequestDecisionItemId,
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
      lifecycleVersion: revision.lifecycle!.lifecycleVersion,
      revisionNumber: revision.revisionNumber,
      sentAt: revision.lifecycle!.sentAt?.toISOString() ?? null,
      status: this.effectiveState(revision),
      subtotalCents: this.safeNumber(revision.subtotalCents),
      taxableSubtotalCents: this.safeNumber(revision.taxableSubtotalCents),
      taxCents: this.safeNumber(revision.taxCents),
      tax: {
        name: revision.tax!.name,
        rateBasisPoints: revision.tax!.rateBasisPoints,
        taxAmountCents: this.safeNumber(revision.tax!.taxAmountCents),
        taxableAmountCents: this.safeNumber(revision.tax!.taxableAmountCents),
      },
      terms: revision.terms,
      totalCents: this.safeNumber(revision.totalCents),
      validUntil: revision.validUntil.toISOString(),
      viewedAt: revision.lifecycle!.viewedAt?.toISOString() ?? null,
    };
  }

  private mapPublic(
    revision: RevisionRecord,
    quote: {
      quoteNumber: string;
      rentalRequest: {
        contactFirstName: string;
        contactLastName: string;
        rentalStartDate: Date;
        rentalEndDate: Date;
      };
    },
  ): PublicQuoteResponse {
    const admin = this.mapRevision(revision);
    const status = admin.status === 'DRAFT' ? 'EXPIRED' : admin.status;
    return {
      chargeTotalCents: admin.chargeTotalCents,
      charges: admin.charges.map(({ amountCents, label, taxable, type }) => ({
        amountCents,
        label,
        taxable,
        type,
      })),
      currency: 'CAD',
      customerName: `${quote.rentalRequest.contactFirstName} ${quote.rentalRequest.contactLastName}`,
      customerNotes: admin.customerNotes,
      discountCents: admin.discountCents,
      itemSubtotalCents: admin.itemSubtotalCents,
      items: admin.items.map(
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
      quoteNumber: quote.quoteNumber,
      rentalEndDate: this.dateOnly(quote.rentalRequest.rentalEndDate),
      rentalStartDate: this.dateOnly(quote.rentalRequest.rentalStartDate),
      revisionNumber: admin.revisionNumber,
      status,
      subtotalCents: admin.subtotalCents,
      taxableSubtotalCents: admin.taxableSubtotalCents,
      tax: admin.tax,
      taxCents: admin.taxCents,
      terms: admin.terms,
      totalCents: admin.totalCents,
      validUntil: admin.validUntil,
    };
  }

  private async access(raw: string) {
    const access = await prisma.quoteCustomerAccess.findUnique({
      where: { tokenHash: this.hash(raw) },
      include: {
        quoteRevision: {
          include: {
            ...revisionInclude,
            quote: { include: { rentalRequest: true } },
          },
        },
      },
    });
    if (
      !access ||
      !this.validRaw(raw, access.id, access.quoteRevisionId) ||
      access.revokedAt ||
      access.expiresAt <= new Date() ||
      access.quoteRevision.quote.customerRevisionId !==
        access.quoteRevisionId ||
      !access.quoteRevision.lifecycle ||
      !this.isCustomerVisible(access.quoteRevision.lifecycle.state)
    )
      throw unavailable();
    return access;
  }

  private async accessInTransaction(tx: Prisma.TransactionClient, raw: string) {
    const access = await tx.quoteCustomerAccess.findUnique({
      where: { tokenHash: this.hash(raw) },
      include: { quoteRevision: { include: { lifecycle: true, quote: true } } },
    });
    if (
      !access ||
      !this.validRaw(raw, access.id, access.quoteRevisionId) ||
      access.revokedAt ||
      access.quoteRevision.quote.customerRevisionId !== access.quoteRevisionId
    )
      throw unavailable();
    return access;
  }

  private rawCapability(id: string, revisionId: string) {
    const signature = createHmac(
      'sha256',
      this.config.get('PUBLIC_QUOTE_ACCESS_SECRET', { infer: true }),
    )
      .update(`${id}:${revisionId}`)
      .digest('base64url');
    return `${id}.${signature}`;
  }

  private validRaw(raw: string, id: string, revisionId: string) {
    const expected = Buffer.from(this.rawCapability(id, revisionId));
    const actual = Buffer.from(raw);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private normalizedInput(input: QuoteRevisionInput) {
    return {
      ...input,
      customerNotes: input.customerNotes ?? null,
      internalNotes: input.internalNotes ?? null,
      terms: input.terms ?? null,
      items: [...input.items].sort((a, b) =>
        a.rentalRequestDecisionItemId.localeCompare(
          b.rentalRequestDecisionItemId,
        ),
      ),
      charges: input.charges.map((charge, sortOrder) => ({
        ...charge,
        sortOrder,
      })),
    };
  }
  private hash(value: unknown) {
    return createHash('sha256')
      .update(typeof value === 'string' ? value : JSON.stringify(value))
      .digest('hex');
  }
  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
  private safeNumber(value: bigint) {
    const result = Number(value);
    if (!Number.isSafeInteger(result)) throw new Error('Unsafe quote amount');
    return result;
  }
  private effectiveState(revision: {
    validUntil: Date;
    lifecycle: { state: QuoteRevisionState } | null;
  }) {
    return revision.lifecycle &&
      this.isActionable(revision.lifecycle.state) &&
      revision.validUntil <= new Date()
      ? 'EXPIRED'
      : (revision.lifecycle?.state ?? 'DRAFT');
  }
  private isActionable(state: QuoteRevisionState) {
    return (
      state === QuoteRevisionState.SENT || state === QuoteRevisionState.VIEWED
    );
  }
  private isCustomerVisible(state: QuoteRevisionState) {
    return (
      this.isActionable(state) ||
      state === QuoteRevisionState.ACCEPTED ||
      state === QuoteRevisionState.REJECTED
    );
  }
  private code(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
  private async lockRequest(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "RentalRequest" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Rental request not found');
  }
  private async lockQuote(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "Quote" WHERE "id"=${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Quote not found');
  }
  private async databaseNow(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT CURRENT_TIMESTAMP AS "now"`;
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
