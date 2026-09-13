import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import { Prisma, prisma } from '@mensah-rentals/database';
import type {
  AdminCartEnquiryListResponse,
  AdminCartEnquiryResponse,
  AdminCartEnquirySummaryResponse,
  PublicCartEnquiryReceiptResponse,
} from '@mensah-rentals/types';
import type {
  CartEnquiryListQuery,
  SubmitCartEnquiryInput,
  UpdateCartEnquiryStatusInput,
} from '@mensah-rentals/validation';

import {
  OutboundEmailDeliveryService,
  PROCESSING_LOCK_TIMEOUT_MS,
} from './outbound-email-delivery.service';

const CART_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RECEIPT_MESSAGE =
  'Your rental enquiry has been received. Mensah Rentals can now review it and contact you about next steps.';

const detailInclude = {
  items: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  outboundEmails: {
    orderBy: [{ createdAt: 'asc' as const }],
    where: { purpose: 'CART_ENQUIRY_COMPANY' as const },
  },
} satisfies Prisma.CartEnquiryInclude;

type Detail = Prisma.CartEnquiryGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class CartEnquiryService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(OutboundEmailDeliveryService)
    private readonly delivery: OutboundEmailDeliveryService,
  ) {}

  async submit(
    rawCartToken: string | undefined,
    input: SubmitCartEnquiryInput,
  ): Promise<PublicCartEnquiryReceiptResponse> {
    if (input.website) return this.receipt(null);
    if (!rawCartToken || !CART_TOKEN_PATTERN.test(rawCartToken))
      throw new UnprocessableEntityException('Rental cart is unavailable.');

    const recipient = this.config
      .getOrThrow<string>('CART_ENQUIRY_RECIPIENT_EMAIL')
      .trim()
      .toLowerCase();
    const sourceCartTokenHash = hashSessionToken(rawCartToken);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cart-enquiry-operation:${input.operationId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cart-enquiry-source:${sourceCartTokenHash}`}))`;
      // Serialize submission against customer-workflow mode changes. The same
      // transaction-scoped lock is held by the feature-settings writer.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1885, 1)`;

      const mode = await tx.customerWorkflowSetting.findUnique({
        select: { mode: true },
        where: { id: 'customer-workflow' },
      });
      if (mode?.mode === 'PLATFORM_REQUEST')
        throw new ConflictException(
          'Email enquiry submission is not currently available.',
        );

      const cart = await tx.cart.findFirst({
        include: {
          items: {
            include: {
              product: {
                include: { category: true },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { productId: 'asc' }],
          },
        },
        where: {
          expiresAt: { gt: new Date() },
          tokenHash: sourceCartTokenHash,
        },
      });
      if (!cart || cart.items.length === 0)
        throw new UnprocessableEntityException('Rental cart is unavailable.');

      const snapshots = cart.items.map(
        ({ desiredQuantity, product }, index) => ({
          categoryNameSnapshot: product.category.name,
          categorySlugSnapshot: product.category.slug,
          productId: product.id,
          productNameSnapshot: product.name,
          productSlugSnapshot: product.slug,
          rentalUnitSnapshot: product.rentalUnit,
          requestedQuantity: desiredQuantity,
          sortOrder: index,
        }),
      );
      const payloadHash = this.hash({
        additionalEquipment: input.additionalEquipment,
        company: input.company,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        customerName: input.customerName,
        customerNotes: input.customerNotes,
        fulfilmentMethod: input.fulfilmentMethod,
        items: snapshots,
        location: input.location,
        projectName: input.projectName,
        rentalEndDate: input.rentalEndDate,
        rentalStartDate: input.rentalStartDate,
      });

      const replay = await tx.cartEnquiry.findFirst({
        where: {
          OR: [{ operationId: input.operationId }, { sourceCartTokenHash }],
        },
      });
      if (replay) {
        if (
          replay.payloadHash !== payloadHash ||
          (replay.operationId === input.operationId &&
            replay.sourceCartTokenHash !== sourceCartTokenHash)
        )
          throw new ConflictException(
            'This enquiry operation conflicts with an earlier submission.',
          );
        return { emailId: null, referenceNumber: replay.referenceNumber };
      }

      const referenceNumber = this.referenceNumber();
      const subject = `New Rental Enquiry — ${referenceNumber}`;
      const textBody = this.emailBody(referenceNumber, input, snapshots);
      const created = await tx.cartEnquiry.create({
        data: {
          additionalEquipment: input.additionalEquipment,
          company: input.company,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          customerName: input.customerName,
          customerNotes: input.customerNotes,
          fulfilmentMethod: input.fulfilmentMethod,
          items: { create: snapshots },
          location: input.location,
          operationId: input.operationId,
          outboundEmails: {
            create: {
              purpose: 'CART_ENQUIRY_COMPANY',
              recipient,
              subject,
              textBody,
            },
          },
          payloadHash,
          projectName: input.projectName,
          referenceNumber,
          rentalEndDate: new Date(`${input.rentalEndDate}T00:00:00.000Z`),
          rentalStartDate: new Date(`${input.rentalStartDate}T00:00:00.000Z`),
          sourceCartTokenHash,
        },
        include: { outboundEmails: true },
      });
      return {
        emailId: created.outboundEmails[0]?.id ?? null,
        referenceNumber,
      };
    });

    if (result.emailId) await this.delivery.attempt(result.emailId);
    return this.receipt(result.referenceNumber);
  }

  async list(
    query: CartEnquiryListQuery,
  ): Promise<AdminCartEnquiryListResponse> {
    const where: Prisma.CartEnquiryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.deliveryStatus
        ? {
            outboundEmails: {
              some: {
                purpose: 'CART_ENQUIRY_COMPANY',
                status: query.deliveryStatus,
              },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { company: { contains: query.search, mode: 'insensitive' } },
              {
                contactEmail: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                customerName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                referenceNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.cartEnquiry.findMany({
        include: detailInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.cartEnquiry.count({ where }),
    ]);
    return {
      items: items.map((item) => this.summary(item)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async get(id: string): Promise<AdminCartEnquiryResponse> {
    const enquiry = await prisma.cartEnquiry.findUnique({
      include: detailInclude,
      where: { id },
    });
    if (!enquiry) throw new NotFoundException('Cart enquiry was not found');
    const delivery = enquiry.outboundEmails[0];
    return {
      ...this.summary(enquiry),
      additionalEquipment: enquiry.additionalEquipment,
      company: enquiry.company,
      contactPhone: enquiry.contactPhone,
      customerNotes: enquiry.customerNotes,
      delivery: {
        attemptCount: delivery?.attemptCount ?? 0,
        lastErrorMessage: delivery?.lastErrorMessage ?? null,
        status: delivery?.status ?? 'QUEUED',
        updatedAt: (delivery?.updatedAt ?? enquiry.updatedAt).toISOString(),
      },
      fulfilmentMethod: enquiry.fulfilmentMethod,
      items: enquiry.items.map((item) => ({
        categoryName: item.categoryNameSnapshot,
        productName: item.productNameSnapshot,
        productSlug: item.productSlugSnapshot,
        rentalUnit: item.rentalUnitSnapshot,
        requestedQuantity: item.requestedQuantity,
      })),
      location: enquiry.location,
      projectName: enquiry.projectName,
      rentalEndDate: this.date(enquiry.rentalEndDate),
      rentalStartDate: this.date(enquiry.rentalStartDate),
    };
  }

  async updateStatus(
    id: string,
    actorUserId: string,
    input: UpdateCartEnquiryStatusInput,
  ): Promise<AdminCartEnquiryResponse> {
    const payloadHash = this.hash({ id, status: input.status });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cart-enquiry-status:${id}`}))`;
      const sourceKey = `cart-enquiry-status:${input.operationId}`;
      const replay = await tx.platformAuditEvent.findUnique({
        where: { sourceKey },
      });
      if (replay) {
        const metadata = replay.metadata as { payloadHash?: string } | null;
        if (metadata?.payloadHash !== payloadHash)
          throw new ConflictException(
            'This operation ID was already used for a different change.',
          );
        return;
      }
      const enquiry = await tx.cartEnquiry.findUnique({ where: { id } });
      if (!enquiry) throw new NotFoundException('Cart enquiry was not found');
      await tx.cartEnquiry.update({
        data: { status: input.status, statusUpdatedByUserId: actorUserId },
        where: { id },
      });
      await tx.platformAuditEvent.create({
        data: {
          action: 'CART_ENQUIRY_STATUS_CHANGED',
          actorUserId,
          domain: 'CART_ENQUIRY',
          entityId: id,
          entityReference: enquiry.referenceNumber,
          entityType: 'CART_ENQUIRY',
          metadata: {
            fromStatus: enquiry.status,
            payloadHash,
            toStatus: input.status,
          },
          sourceKey,
          summary: `Cart enquiry ${enquiry.referenceNumber} status changed from ${enquiry.status} to ${input.status}.`,
        },
      });
    });
    return this.get(id);
  }

  async retryDelivery(
    id: string,
    actorUserId: string,
    operationId: string,
  ): Promise<AdminCartEnquiryResponse> {
    const payloadHash = this.hash({ id });
    const emailId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cart-enquiry-retry:${id}`}))`;
      const sourceKey = `cart-enquiry-email-retry:${operationId}`;
      const replay = await tx.platformAuditEvent.findUnique({
        where: { sourceKey },
      });
      if (replay) {
        const metadata = replay.metadata as { payloadHash?: string } | null;
        if (metadata?.payloadHash !== payloadHash || replay.entityId !== id)
          throw new ConflictException(
            'This operation ID was already used for a different retry.',
          );
        return replay.sourceId;
      }
      const enquiry = await tx.cartEnquiry.findUnique({
        include: {
          outboundEmails: {
            where: { purpose: 'CART_ENQUIRY_COMPANY' },
          },
        },
        where: { id },
      });
      if (!enquiry) throw new NotFoundException('Cart enquiry was not found');
      const email = enquiry.outboundEmails[0];
      if (!email) throw new NotFoundException('Enquiry email was not found');
      if (email.status === 'SENT')
        throw new ConflictException('This enquiry email was already sent.');
      if (
        email.status === 'PROCESSING' &&
        email.lockedAt &&
        email.lockedAt.getTime() > Date.now() - PROCESSING_LOCK_TIMEOUT_MS
      )
        throw new ConflictException(
          'This enquiry email is already processing.',
        );
      await tx.outboundEmail.update({
        data: { lockedAt: null, nextAttemptAt: new Date(), status: 'QUEUED' },
        where: { id: email.id },
      });
      await tx.platformAuditEvent.create({
        data: {
          action: 'CART_ENQUIRY_EMAIL_RETRY_QUEUED',
          actorUserId,
          domain: 'CART_ENQUIRY',
          entityId: id,
          entityReference: enquiry.referenceNumber,
          entityType: 'CART_ENQUIRY',
          metadata: { payloadHash },
          sourceId: email.id,
          sourceKey,
          sourceType: 'OUTBOUND_EMAIL',
          summary: `A company email retry was queued for cart enquiry ${enquiry.referenceNumber}.`,
        },
      });
      return email.id;
    });
    if (emailId) await this.delivery.attempt(emailId);
    return this.get(id);
  }

  private summary(enquiry: Detail): AdminCartEnquirySummaryResponse {
    return {
      contactEmail: enquiry.contactEmail,
      createdAt: enquiry.createdAt.toISOString(),
      customerName: enquiry.customerName,
      deliveryStatus: enquiry.outboundEmails[0]?.status ?? 'QUEUED',
      id: enquiry.id,
      referenceNumber: enquiry.referenceNumber,
      requestedUnitCount: enquiry.items.reduce(
        (sum, item) => sum + item.requestedQuantity,
        0,
      ),
      status: enquiry.status,
    };
  }

  private receipt(referenceNumber: string | null) {
    return {
      accepted: true as const,
      message: RECEIPT_MESSAGE,
      referenceNumber,
    };
  }

  private date(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private referenceNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `MR-${date}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  }

  private emailBody(
    reference: string,
    input: SubmitCartEnquiryInput,
    items: Array<{
      productNameSnapshot: string;
      requestedQuantity: number;
      rentalUnitSnapshot: string;
    }>,
  ): string {
    const lines = items.map(
      (item) =>
        `- ${item.productNameSnapshot}: ${item.requestedQuantity} ${item.rentalUnitSnapshot}`,
    );
    return [
      `New rental enquiry: ${reference}`,
      '',
      `Customer: ${input.customerName}`,
      `Email: ${input.contactEmail}`,
      `Phone: ${input.contactPhone}`,
      `Company: ${input.company ?? 'Not supplied'}`,
      `Project: ${input.projectName ?? 'Not supplied'}`,
      `Rental dates: ${input.rentalStartDate} to ${input.rentalEndDate}`,
      `Fulfilment: ${input.fulfilmentMethod}`,
      `Location: ${input.location ?? 'Not supplied'}`,
      '',
      'Requested equipment:',
      ...lines,
      '',
      `Additional equipment: ${input.additionalEquipment ?? 'None supplied'}`,
      `Customer notes: ${input.customerNotes ?? 'None supplied'}`,
      `Submitted: ${new Date().toISOString()}`,
    ].join('\n');
  }
}
