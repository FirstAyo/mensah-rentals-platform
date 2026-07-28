import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@mensah-rentals/database';
import type {
  AdminRentalRequestRevisionResponse,
  RentalRequestRevisionComparisonResponse,
} from '@mensah-rentals/types';

const select = {
  amendmentReason: true,
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
      id: true,
      productId: true,
      productNameSnapshot: true,
      productSlugSnapshot: true,
      rentalUnitSnapshot: true,
      requestedQuantity: true,
      sortOrder: true,
    },
  },
  projectLocation: true,
  projectName: true,
  projectType: true,
  rentalEndDate: true,
  rentalRequest: { select: { referenceNumber: true } },
  rentalRequestId: true,
  rentalStartDate: true,
  requestedTimeZone: true,
  revisionNumber: true,
  submittedByType: true,
} satisfies Prisma.RentalRequestRevisionSelect;

type Selected = Prisma.RentalRequestRevisionGetPayload<{
  select: typeof select;
}>;

@Injectable()
export class RentalRequestRevisionService {
  async list(rentalRequestId: string) {
    await this.ensureRequest(rentalRequestId);
    return (
      await prisma.rentalRequestRevision.findMany({
        where: { rentalRequestId },
        orderBy: { revisionNumber: 'desc' },
        select,
      })
    ).map((revision) => this.map(revision));
  }

  async detail(rentalRequestId: string, revisionId: string) {
    const revision = await prisma.rentalRequestRevision.findFirst({
      where: { id: revisionId, rentalRequestId },
      select,
    });
    if (!revision) throw new NotFoundException('Request revision not found');
    return this.map(revision);
  }

  async comparison(
    rentalRequestId: string,
    revisionId: string,
  ): Promise<RentalRequestRevisionComparisonResponse> {
    const current = await prisma.rentalRequestRevision.findFirst({
      where: { id: revisionId, rentalRequestId },
      select,
    });
    if (!current) throw new NotFoundException('Request revision not found');
    const previous = await prisma.rentalRequestRevision.findUnique({
      where: {
        rentalRequestId_revisionNumber: {
          rentalRequestId,
          revisionNumber: current.revisionNumber - 1,
        },
      },
      select,
    });
    const before = new Map(
      previous?.items.map((item) => [
        item.productId ?? item.productSlugSnapshot,
        item,
      ]) ?? [],
    );
    const after = new Map(
      current.items.map((item) => [
        item.productId ?? item.productSlugSnapshot,
        item,
      ]),
    );
    const keys = [...new Set([...before.keys(), ...after.keys()])];
    const items = keys
      .map((key) => {
        const oldItem = before.get(key);
        const newItem = after.get(key);
        const previousQuantity = oldItem?.requestedQuantity ?? null;
        const currentQuantity = newItem?.requestedQuantity ?? null;
        const kind = !oldItem
          ? ('ADDED' as const)
          : !newItem
            ? ('REMOVED' as const)
            : currentQuantity! > previousQuantity!
              ? ('QUANTITY_INCREASED' as const)
              : currentQuantity! < previousQuantity!
                ? ('QUANTITY_DECREASED' as const)
                : ('UNCHANGED' as const);
        return {
          currentQuantity,
          kind,
          previousQuantity,
          productName: (newItem ?? oldItem)!.productNameSnapshot,
          productSlug: (newItem ?? oldItem)!.productSlugSnapshot,
        };
      })
      .sort((left, right) => left.productName.localeCompare(right.productName));
    const fields: RentalRequestRevisionComparisonResponse['fields'] = [];
    if (previous) {
      const comparisons: Array<[string, unknown, unknown]> = [
        [
          'rentalStartDate',
          this.day(previous.rentalStartDate),
          this.day(current.rentalStartDate),
        ],
        [
          'rentalEndDate',
          this.day(previous.rentalEndDate),
          this.day(current.rentalEndDate),
        ],
        [
          'requestedTimeZone',
          previous.requestedTimeZone,
          current.requestedTimeZone,
        ],
        [
          'fulfillmentMethod',
          previous.fulfillmentMethod,
          current.fulfillmentMethod,
        ],
        ['deliveryAddress', previous.deliveryAddress, current.deliveryAddress],
        ['projectName', previous.projectName, current.projectName],
        ['projectType', previous.projectType, current.projectType],
        ['projectLocation', previous.projectLocation, current.projectLocation],
        [
          'contactFirstName',
          previous.contactFirstName,
          current.contactFirstName,
        ],
        ['contactLastName', previous.contactLastName, current.contactLastName],
        ['contactEmail', previous.contactEmail, current.contactEmail],
        ['contactPhone', previous.contactPhone, current.contactPhone],
        ['companyName', previous.companyName, current.companyName],
        ['customerNotes', previous.customerNotes, current.customerNotes],
      ];
      for (const [field, oldValue, newValue] of comparisons)
        if (oldValue !== newValue)
          fields.push({
            currentValue: newValue == null ? null : String(newValue),
            field,
            kind: 'FIELD_CHANGED',
            previousValue: oldValue == null ? null : String(oldValue),
          });
    }
    return { fields, items };
  }

  private async ensureRequest(id: string) {
    if (
      !(await prisma.rentalRequest.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Rental request not found');
  }

  private map(revision: Selected): AdminRentalRequestRevisionResponse {
    return {
      amendmentReason: revision.amendmentReason,
      companyName: revision.companyName,
      contactEmail: revision.contactEmail,
      contactFirstName: revision.contactFirstName,
      contactLastName: revision.contactLastName,
      contactPhone: revision.contactPhone,
      createdAt: revision.createdAt.toISOString(),
      customerNotes: revision.customerNotes,
      deliveryAddress: revision.deliveryAddress,
      fulfillmentMethod: revision.fulfillmentMethod,
      id: revision.id,
      items: revision.items.map((item) => ({
        categoryName: item.categoryNameSnapshot,
        categorySlug: item.categorySlugSnapshot,
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        productSlug: item.productSlugSnapshot,
        rentalUnit: item.rentalUnitSnapshot,
        requestedQuantity: item.requestedQuantity,
        sortOrder: item.sortOrder,
      })),
      projectLocation: revision.projectLocation,
      projectName: revision.projectName,
      projectType: revision.projectType,
      referenceNumber: revision.rentalRequest.referenceNumber,
      rentalEndDate: this.day(revision.rentalEndDate),
      rentalStartDate: this.day(revision.rentalStartDate),
      requestedTimeZone: revision.requestedTimeZone,
      revisionNumber: revision.revisionNumber,
      submittedByType: revision.submittedByType,
    };
  }

  private day(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
