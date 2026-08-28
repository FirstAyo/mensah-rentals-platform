import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactEnquiryStatus, Prisma, prisma } from '@mensah-rentals/database';
import type {
  AdminContactEnquiryResponse,
  AdminContactEnquirySummaryResponse,
  PublicContactEnquiryReceiptResponse,
} from '@mensah-rentals/types';
import type {
  ContactEnquiryListQuery,
  SubmitContactEnquiryInput,
  UpdateContactEnquiryStatusInput,
} from '@mensah-rentals/validation';

const RECEIPT_MESSAGE =
  'Thank you. Your enquiry has been received by Mensah Rentals & Services.';

@Injectable()
export class ContactEnquiryService {
  async submit(
    input: SubmitContactEnquiryInput,
  ): Promise<PublicContactEnquiryReceiptResponse> {
    if (input.website) {
      return {
        accepted: true,
        message: RECEIPT_MESSAGE,
        referenceNumber: null,
      };
    }
    const payloadHash = this.hash({
      company: input.company,
      email: input.email,
      enquiryType: input.enquiryType,
      message: input.message,
      name: input.name,
      phone: input.phone,
    });
    const existing = await prisma.contactEnquiry.findUnique({
      where: { operationId: input.operationId },
    });
    if (existing)
      return this.replayReceipt(
        existing.payloadHash,
        payloadHash,
        existing.referenceNumber,
      );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const created = await prisma.contactEnquiry.create({
          data: {
            company: input.company,
            email: input.email,
            enquiryType: input.enquiryType,
            message: input.message,
            name: input.name,
            operationId: input.operationId,
            payloadHash,
            phone: input.phone,
            referenceNumber: this.referenceNumber(),
          },
        });
        return {
          accepted: true,
          message: RECEIPT_MESSAGE,
          referenceNumber: created.referenceNumber,
        };
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        const replay = await prisma.contactEnquiry.findUnique({
          where: { operationId: input.operationId },
        });
        if (replay)
          return this.replayReceipt(
            replay.payloadHash,
            payloadHash,
            replay.referenceNumber,
          );
      }
    }
    throw new ConflictException(
      'The enquiry could not be accepted. Please retry.',
    );
  }

  async list(query: ContactEnquiryListQuery) {
    const where: Prisma.ContactEnquiryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { company: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
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
      prisma.contactEnquiry.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.contactEnquiry.count({ where }),
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

  async get(id: string): Promise<AdminContactEnquiryResponse> {
    const enquiry = await prisma.contactEnquiry.findUnique({
      include: {
        statusUpdatedBy: {
          select: { firstName: true, id: true, lastName: true },
        },
      },
      where: { id },
    });
    if (!enquiry) throw new NotFoundException('Contact enquiry was not found');
    return {
      ...this.summary(enquiry),
      message: enquiry.message,
      statusUpdatedBy: enquiry.statusUpdatedBy,
    };
  }

  async updateStatus(
    id: string,
    actorUserId: string,
    input: UpdateContactEnquiryStatusInput,
  ): Promise<AdminContactEnquiryResponse> {
    const payloadHash = this.hash({ id, status: input.status });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contact-enquiry:${id}`}))`;
      const replay = await tx.platformAuditEvent.findUnique({
        where: { sourceKey: `contact-enquiry-status:${input.operationId}` },
      });
      if (replay) {
        const metadata = replay.metadata as { payloadHash?: string } | null;
        if (metadata?.payloadHash !== payloadHash)
          throw new ConflictException(
            'This operation ID was already used for a different change.',
          );
        return;
      }
      const enquiry = await tx.contactEnquiry.findUnique({ where: { id } });
      if (!enquiry)
        throw new NotFoundException('Contact enquiry was not found');
      await tx.contactEnquiry.update({
        data: { status: input.status, statusUpdatedByUserId: actorUserId },
        where: { id },
      });
      await tx.platformAuditEvent.create({
        data: {
          action: 'CONTACT_ENQUIRY_STATUS_CHANGED',
          actorUserId,
          domain: 'CONTACT_ENQUIRY',
          entityId: id,
          entityReference: enquiry.referenceNumber,
          entityType: 'CONTACT_ENQUIRY',
          metadata: {
            fromStatus: enquiry.status,
            payloadHash,
            toStatus: input.status,
          },
          sourceKey: `contact-enquiry-status:${input.operationId}`,
          summary: `Contact enquiry ${enquiry.referenceNumber} status changed from ${enquiry.status} to ${input.status}.`,
        },
      });
    });
    return this.get(id);
  }

  private summary(enquiry: {
    company: string | null;
    createdAt: Date;
    email: string;
    enquiryType: string;
    id: string;
    name: string;
    phone: string | null;
    referenceNumber: string;
    status: ContactEnquiryStatus;
    updatedAt: Date;
  }): AdminContactEnquirySummaryResponse {
    return {
      company: enquiry.company,
      createdAt: enquiry.createdAt.toISOString(),
      email: enquiry.email,
      enquiryType:
        enquiry.enquiryType as AdminContactEnquirySummaryResponse['enquiryType'],
      id: enquiry.id,
      name: enquiry.name,
      phone: enquiry.phone,
      referenceNumber: enquiry.referenceNumber,
      status: enquiry.status,
      updatedAt: enquiry.updatedAt.toISOString(),
    };
  }

  private replayReceipt(
    existingHash: string,
    payloadHash: string,
    referenceNumber: string,
  ) {
    if (existingHash !== payloadHash)
      throw new ConflictException(
        'This operation ID was already used for a different enquiry.',
      );
    return {
      accepted: true as const,
      message: RECEIPT_MESSAGE,
      referenceNumber,
    };
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private referenceNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `ENQ-${date}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  }
}
