import { randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@mensah-rentals/database';

import { createCsv, safeReportFilename } from './csv-export';
import {
  resolveReportRange,
  type ResolvedReportRange,
} from './report-date-range';
import { REPORTING_METRIC_DEFINITIONS } from './reporting-metric-definitions';
import type {
  InventoryReportQuery,
  MaintenanceReportQuery,
  QuoteOrderReportQuery,
  RentalRequestReportQuery,
  RentalsReturnsReportQuery,
  ReportKey,
  ReportOverviewQuery,
} from './reporting.schemas';

type MetricFormat = 'COUNT' | 'PERCENT' | 'MONEY' | 'DURATION';
type ReportMetric = {
  currency?: 'CAD';
  description?: string;
  format: MetricFormat;
  key: string;
  label: string;
  value: number | string;
};
type ReportItem = {
  fields: Array<{ label: string; value: number | string }>;
  href?: string;
  id: string;
  occurredAt?: string;
  reference: string;
  status?: string;
  subtitle?: string;
  title: string;
};

const STATES = [
  'RENTABLE',
  'RENTED',
  'MAINTENANCE',
  'DAMAGED',
  'MISSING',
  'LOST',
  'RETIRED',
] as const;

@Injectable()
export class ReportingService {
  private readonly timeZone = process.env.REPORTING_TIME_ZONE ?? 'Africa/Accra';
  private readonly maxDays = this.boundedEnvironmentNumber(
    'REPORT_EXPORT_MAX_DAYS',
    366,
    1,
    3660,
  );
  private readonly maxRows = this.boundedEnvironmentNumber(
    'REPORT_EXPORT_MAX_ROWS',
    10_000,
    1,
    100_000,
  );

  async overview(
    query: ReportOverviewQuery,
    permissionKeys: readonly string[],
  ) {
    const range = this.range(query);
    const metrics: ReportMetric[] = [];
    if (this.hasAll(permissionKeys, 'rental_request.view'))
      metrics.push(...(await this.requestMetrics(range)));
    if (this.hasAll(permissionKeys, 'quote.view'))
      metrics.push(...(await this.quoteMetrics(range)));
    if (this.hasAll(permissionKeys, 'order.view'))
      metrics.push(...(await this.orderMetrics(range)));
    if (this.hasAll(permissionKeys, 'fulfilment.view'))
      metrics.push(...(await this.fulfilmentMetrics(range)));
    if (
      this.hasAll(
        permissionKeys,
        'active_rental.view',
        'return.view',
        'rental_issue.view',
      )
    )
      metrics.push(...(await this.rentalReturnMetrics(range)));
    if (this.hasAll(permissionKeys, 'maintenance.view', 'inspection.view'))
      metrics.push(...(await this.maintenanceMetrics(range)));
    const series = this.hasAll(permissionKeys, 'rental_request.view')
      ? [await this.requestVolumeSeries(range)]
      : [];
    return { range: this.rangeDto(range), metrics, series };
  }

  async rentalRequests(query: RentalRequestReportQuery) {
    const range = this.range(query);
    const where: Prisma.RentalRequestWhereInput = {
      submittedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      status: query.status,
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
              { contactEmail: { contains: query.search, mode: 'insensitive' } },
              { projectName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows, metrics] = await Promise.all([
      prisma.rentalRequest.count({ where }),
      prisma.rentalRequest.findMany({
        orderBy: [
          { submittedAt: query.sortDirection },
          { id: query.sortDirection },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          contactEmail: true,
          contactFirstName: true,
          contactLastName: true,
          currentRevision: { select: { revisionNumber: true } },
          id: true,
          projectName: true,
          quote: {
            select: {
              latestRevision: {
                select: { lifecycle: { select: { state: true } } },
              },
            },
          },
          referenceNumber: true,
          rentalOrder: { select: { id: true } },
          rentalEndDate: true,
          rentalStartDate: true,
          status: true,
          submittedAt: true,
        },
        where,
      }),
      this.requestMetrics(range),
    ]);
    const items: ReportItem[] = rows.map((row) => ({
      fields: [
        { label: 'Email', value: this.maskEmail(row.contactEmail) },
        {
          label: 'Latest revision',
          value: row.currentRevision?.revisionNumber ?? 1,
        },
        { label: 'Rental start', value: this.dateOnly(row.rentalStartDate) },
        { label: 'Rental end', value: this.dateOnly(row.rentalEndDate) },
        {
          label: 'Quote status',
          value: row.quote?.latestRevision?.lifecycle?.state ?? 'NONE',
        },
        { label: 'Order created', value: row.rentalOrder ? 'YES' : 'NO' },
      ],
      href: `/rental-requests/${row.id}`,
      id: row.id,
      occurredAt: row.submittedAt.toISOString(),
      reference: row.referenceNumber,
      status: row.status,
      subtitle: row.projectName,
      title: `${row.contactFirstName} ${row.contactLastName}`,
    }));
    return this.page(range, metrics, items, query.page, query.pageSize, total);
  }

  async quotesOrders(query: QuoteOrderReportQuery) {
    const range = this.range(query);
    const search = query.search;
    const quoteWhere: Prisma.QuoteWhereInput = {
      createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      ...(query.quoteStatus
        ? { latestRevision: { lifecycle: { state: query.quoteStatus } } }
        : {}),
      ...(search
        ? {
            OR: [
              { quoteNumber: { contains: search, mode: 'insensitive' } },
              {
                rentalRequest: {
                  referenceNumber: { contains: search, mode: 'insensitive' },
                },
              },
              {
                rentalRequest: {
                  contactFirstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                rentalRequest: {
                  contactLastName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const orderWhere: Prisma.RentalOrderWhereInput = {
      confirmedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
              {
                quote: {
                  quoteNumber: { contains: search, mode: 'insensitive' },
                },
              },
              {
                contactFirstNameSnapshot: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                contactLastNameSnapshot: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const includeQuotes = query.recordType !== 'ORDER';
    const includeOrders = query.recordType !== 'QUOTE';
    const [
      quoteRows,
      orderRows,
      quoteCount,
      orderCount,
      quoteMetrics,
      orderMetrics,
    ] = await Promise.all([
      includeQuotes
        ? prisma.quote.findMany({
            orderBy: [
              { createdAt: query.sortDirection },
              { id: query.sortDirection },
            ],
            take: query.page * query.pageSize,
            select: {
              createdAt: true,
              id: true,
              latestRevision: {
                select: {
                  lifecycle: { select: { state: true } },
                  totalCents: true,
                },
              },
              quoteNumber: true,
              rentalRequest: {
                select: {
                  contactFirstName: true,
                  contactLastName: true,
                  projectName: true,
                  referenceNumber: true,
                },
              },
            },
            where: quoteWhere,
          })
        : [],
      includeOrders
        ? prisma.rentalOrder.findMany({
            orderBy: [
              { confirmedAt: query.sortDirection },
              { id: query.sortDirection },
            ],
            take: query.page * query.pageSize,
            select: {
              confirmedAt: true,
              contactFirstNameSnapshot: true,
              contactLastNameSnapshot: true,
              id: true,
              orderNumber: true,
              projectNameSnapshot: true,
              status: true,
              totalCents: true,
            },
            where: orderWhere,
          })
        : [],
      includeQuotes ? prisma.quote.count({ where: quoteWhere }) : 0,
      includeOrders ? prisma.rentalOrder.count({ where: orderWhere }) : 0,
      this.quoteMetrics(range),
      this.orderMetrics(range),
    ]);
    const items: ReportItem[] = [
      ...quoteRows.map(
        (row): ReportItem => ({
          fields: [
            { label: 'Record type', value: 'Quote' },
            {
              label: 'Value (CAD cents)',
              value: row.latestRevision?.totalCents.toString() ?? '0',
            },
          ],
          href: `/quotes/${row.id}`,
          id: `quote:${row.id}`,
          occurredAt: row.createdAt.toISOString(),
          reference: row.quoteNumber,
          status: row.latestRevision?.lifecycle?.state ?? 'DRAFT',
          subtitle: row.rentalRequest.projectName,
          title: `${row.rentalRequest.contactFirstName} ${row.rentalRequest.contactLastName}`,
        }),
      ),
      ...orderRows.map(
        (row): ReportItem => ({
          fields: [
            { label: 'Record type', value: 'Confirmed order' },
            { label: 'Value (CAD cents)', value: row.totalCents.toString() },
          ],
          href: `/orders/${row.id}`,
          id: `order:${row.id}`,
          occurredAt: row.confirmedAt.toISOString(),
          reference: row.orderNumber,
          status: row.status,
          subtitle: row.projectNameSnapshot,
          title: `${row.contactFirstNameSnapshot} ${row.contactLastNameSnapshot}`,
        }),
      ),
    ].sort((left, right) =>
      query.sortDirection === 'asc'
        ? (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '')
        : (right.occurredAt ?? '').localeCompare(left.occurredAt ?? ''),
    );
    return this.page(
      range,
      [...quoteMetrics, ...orderMetrics],
      items.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      query.page,
      query.pageSize,
      quoteCount + orderCount,
    );
  }

  async rentalsReturns(query: RentalsReturnsReportQuery) {
    const range = this.range(query);
    const now = new Date();
    const activeWhere: Prisma.ActiveRentalWhereInput = {
      checkedOutAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      ...(query.overdue === undefined
        ? {}
        : query.overdue
          ? { expectedReturnAt: { lt: now }, status: { not: 'COMPLETED' } }
          : {
              OR: [{ expectedReturnAt: { gte: now } }, { status: 'COMPLETED' }],
            }),
      ...(query.search
        ? {
            rentalOrder: {
              OR: [
                {
                  orderNumber: { contains: query.search, mode: 'insensitive' },
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
              ],
            },
          }
        : {}),
    };
    const returnWhere: Prisma.RentalReturnWhereInput = {
      firstReturnAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      ...(query.search
        ? {
            OR: [
              { returnNumber: { contains: query.search, mode: 'insensitive' } },
              {
                activeRental: {
                  rentalOrder: {
                    orderNumber: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const active = query.recordType !== 'RETURN';
    const returns = query.recordType !== 'ACTIVE_RENTAL';
    const [activeRows, returnRows, activeCount, returnCount, metrics] =
      await Promise.all([
        active
          ? prisma.activeRental.findMany({
              orderBy: [
                { checkedOutAt: query.sortDirection },
                { id: query.sortDirection },
              ],
              take: query.page * query.pageSize,
              select: {
                checkedOutAt: true,
                expectedReturnAt: true,
                id: true,
                rentalOrder: {
                  select: {
                    contactFirstNameSnapshot: true,
                    contactLastNameSnapshot: true,
                    orderNumber: true,
                    projectNameSnapshot: true,
                  },
                },
                status: true,
              },
              where: activeWhere,
            })
          : [],
        returns
          ? prisma.rentalReturn.findMany({
              orderBy: [
                { firstReturnAt: query.sortDirection },
                { id: query.sortDirection },
              ],
              take: query.page * query.pageSize,
              select: {
                activeRental: {
                  select: {
                    rentalOrder: {
                      select: { orderNumber: true, projectNameSnapshot: true },
                    },
                  },
                },
                firstReturnAt: true,
                id: true,
                returnNumber: true,
                status: true,
              },
              where: returnWhere,
            })
          : [],
        active ? prisma.activeRental.count({ where: activeWhere }) : 0,
        returns ? prisma.rentalReturn.count({ where: returnWhere }) : 0,
        this.rentalReturnMetrics(range),
      ]);
    const items: ReportItem[] = [
      ...activeRows.map(
        (row): ReportItem => ({
          fields: [
            { label: 'Record type', value: 'Active rental' },
            {
              label: 'Expected return',
              value: row.expectedReturnAt.toISOString(),
            },
          ],
          href: `/active-rentals/${row.id}`,
          id: `rental:${row.id}`,
          occurredAt: row.checkedOutAt.toISOString(),
          reference: row.rentalOrder.orderNumber,
          status: row.status,
          subtitle: row.rentalOrder.projectNameSnapshot,
          title: `${row.rentalOrder.contactFirstNameSnapshot} ${row.rentalOrder.contactLastNameSnapshot}`,
        }),
      ),
      ...returnRows.map(
        (row): ReportItem => ({
          fields: [{ label: 'Record type', value: 'Return' }],
          href: `/returns/${row.id}`,
          id: `return:${row.id}`,
          occurredAt: row.firstReturnAt.toISOString(),
          reference: row.returnNumber,
          status: row.status,
          subtitle: row.activeRental.rentalOrder.projectNameSnapshot,
          title: row.activeRental.rentalOrder.orderNumber,
        }),
      ),
    ].sort((a, b) =>
      query.sortDirection === 'asc'
        ? (a.occurredAt ?? '').localeCompare(b.occurredAt ?? '')
        : (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''),
    );
    return this.page(
      range,
      metrics,
      items.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      query.page,
      query.pageSize,
      activeCount + returnCount,
    );
  }

  async inventory(query: InventoryReportQuery) {
    const range = this.range(query);
    const productWhere: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const where: Prisma.InventoryTransactionWhereInput = {
      action: query.action,
      createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      inventory: {
        productId: query.productId,
        trackingMode: query.trackingMode,
        ...(query.categoryId || query.search ? { product: productWhere } : {}),
      },
    };
    // Remove the relation object when it has no active filter.
    if (
      !query.productId &&
      !query.trackingMode &&
      !query.categoryId &&
      !query.search
    )
      delete where.inventory;
    const [total, rows, physical, commitments] = await Promise.all([
      prisma.inventoryTransaction.count({ where }),
      prisma.inventoryTransaction.findMany({
        orderBy: [
          { createdAt: query.sortDirection },
          { id: query.sortDirection },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          action: true,
          createdAt: true,
          fromState: true,
          id: true,
          inventory: {
            select: { product: { select: { name: true } }, trackingMode: true },
          },
          quantity: true,
          toState: true,
        },
        where,
      }),
      this.physicalStateMetrics(),
      prisma.inventoryReservationItem.aggregate({
        _sum: { reservedQuantity: true },
        where: {
          inventoryReservation: {
            status: {
              in: ['PARTIALLY_RESERVED', 'RESERVED', 'PARTIALLY_CONSUMED'],
            },
          },
        },
      }),
    ]);
    const metrics = [...physical];
    const reserved = commitments._sum.reservedQuantity ?? 0;
    metrics.push({
      description:
        'A date-based commitment, separate from physical inventory state.',
      format: 'COUNT',
      key: 'reservation_commitment_quantity',
      label: 'Active reservation commitments',
      value: reserved,
    });
    const items: ReportItem[] = rows.map((row) => ({
      fields: [
        { label: 'Tracking', value: row.inventory.trackingMode },
        { label: 'From', value: row.fromState ?? 'NONE' },
        { label: 'To', value: row.toState ?? 'NONE' },
        { label: 'Quantity', value: row.quantity },
      ],
      id: row.id,
      occurredAt: row.createdAt.toISOString(),
      reference: row.action,
      status: row.toState ?? row.action,
      title: row.inventory.product.name,
    }));
    return this.page(range, metrics, items, query.page, query.pageSize, total);
  }

  async maintenance(query: MaintenanceReportQuery) {
    const range = this.range(query);
    const workStatuses = new Set([
      'OPEN',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_FOR_PARTS',
      'READY_FOR_INSPECTION',
      'COMPLETED',
      'CANCELLED',
    ]);
    const inspectionStatuses = new Set([
      'SCHEDULED',
      'IN_PROGRESS',
      'PASSED',
      'FAILED',
      'CANCELLED',
    ]);
    const workWhere: Prisma.MaintenanceWorkOrderWhereInput = {
      createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      priority: query.priority,
      ...(query.status
        ? workStatuses.has(query.status)
          ? { status: query.status as never }
          : { id: '__no_work_order_matches__' }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                workOrderNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                productNameSnapshot: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const inspectionWhere: Prisma.EquipmentInspectionWhereInput = {
      createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      ...(query.status
        ? inspectionStatuses.has(query.status)
          ? { status: query.status as never }
          : { id: '__no_inspection_matches__' }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                inspectionNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                productNameSnapshot: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const work = query.recordType !== 'INSPECTION';
    const inspections = query.recordType !== 'WORK_ORDER';
    const [workRows, inspectionRows, workCount, inspectionCount, metrics] =
      await Promise.all([
        work
          ? prisma.maintenanceWorkOrder.findMany({
              orderBy: [
                { createdAt: query.sortDirection },
                { id: query.sortDirection },
              ],
              take: query.page * query.pageSize,
              select: {
                createdAt: true,
                id: true,
                priority: true,
                productNameSnapshot: true,
                status: true,
                title: true,
                workOrderNumber: true,
              },
              where: workWhere,
            })
          : [],
        inspections
          ? prisma.equipmentInspection.findMany({
              orderBy: [
                { createdAt: query.sortDirection },
                { id: query.sortDirection },
              ],
              take: query.page * query.pageSize,
              select: {
                createdAt: true,
                id: true,
                inspectionNumber: true,
                productNameSnapshot: true,
                result: true,
                status: true,
              },
              where: inspectionWhere,
            })
          : [],
        work ? prisma.maintenanceWorkOrder.count({ where: workWhere }) : 0,
        inspections
          ? prisma.equipmentInspection.count({ where: inspectionWhere })
          : 0,
        this.maintenanceMetrics(range),
      ]);
    const items: ReportItem[] = [
      ...workRows.map(
        (row): ReportItem => ({
          fields: [
            { label: 'Record type', value: 'Work order' },
            { label: 'Priority', value: row.priority },
          ],
          href: `/maintenance/work-orders/${row.id}`,
          id: `work:${row.id}`,
          occurredAt: row.createdAt.toISOString(),
          reference: row.workOrderNumber,
          status: row.status,
          subtitle: row.productNameSnapshot,
          title: row.title,
        }),
      ),
      ...inspectionRows.map(
        (row): ReportItem => ({
          fields: [
            { label: 'Record type', value: 'Inspection' },
            { label: 'Result', value: row.result ?? 'PENDING' },
          ],
          href: `/maintenance/inspections/${row.id}`,
          id: `inspection:${row.id}`,
          occurredAt: row.createdAt.toISOString(),
          reference: row.inspectionNumber,
          status: row.status,
          title: row.productNameSnapshot,
        }),
      ),
    ].sort((a, b) =>
      query.sortDirection === 'asc'
        ? (a.occurredAt ?? '').localeCompare(b.occurredAt ?? '')
        : (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''),
    );
    return this.page(
      range,
      metrics,
      items.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      query.page,
      query.pageSize,
      workCount + inspectionCount,
    );
  }

  async exportReport(
    actorId: string,
    actorPermissionKeys: readonly string[],
    reportKey: ReportKey,
    query:
      | RentalRequestReportQuery
      | QuoteOrderReportQuery
      | RentalsReturnsReportQuery
      | InventoryReportQuery
      | MaintenanceReportQuery,
    requestId?: string,
  ) {
    const required = this.requiredPermissions(reportKey);
    if (
      !this.hasAll(
        actorPermissionKeys,
        'report.view',
        'report.export',
        ...required,
      )
    )
      throw new ForbiddenException('Insufficient permissions');
    const rows: ReportItem[] = [];
    let page = 1;
    let total = 0;
    do {
      const input = {
        ...query,
        page,
        pageSize: Math.min(100, this.maxRows + 1 - rows.length),
      };
      const response = await this.reportByKey(reportKey, input as never);
      total = response.meta.total;
      rows.push(...response.items);
      page += 1;
    } while (rows.length <= this.maxRows && rows.length < total);
    if (total > this.maxRows || rows.length > this.maxRows)
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message: `This export exceeds ${this.maxRows} rows. Narrow the filters and try again.`,
        statusCode: 422,
      });
    await this.assertLivePermissions(actorId, [
      'report.view',
      'report.export',
      ...required,
    ]);
    const range = this.range(query);
    const csv = createCsv(
      ['Reference', 'Title', 'Status', 'Occurred at', 'Details'],
      rows.map((row) => [
        row.reference,
        row.title,
        row.status ?? '',
        row.occurredAt ?? '',
        row.fields.map(({ label, value }) => `${label}: ${value}`).join('; '),
      ]),
    );
    await prisma.$executeRaw`
      INSERT INTO "PlatformAuditEvent"
        ("id", "occurredAt", "actorUserId", "domain", "action", "entityType", "entityReference", "summary", "metadata", "requestId", "createdAt")
      VALUES
        (${this.cuidLike()}, NOW(), ${actorId}, 'REPORTING', 'REPORT_EXPORT_GENERATED', 'REPORT', ${reportKey},
         ${`Exported ${rows.length} ${reportKey} report rows.`},
         ${JSON.stringify({ endDate: range.endDate, filters: this.safeFilterSummary(query), reportKey, rowCount: rows.length, startDate: range.startDate })}::jsonb,
         ${requestId ?? null}, NOW())
    `;
    return {
      csv,
      filename: safeReportFilename(reportKey, range.startDate, range.endDate),
      rowCount: rows.length,
    };
  }

  private reportByKey(reportKey: ReportKey, query: never) {
    if (reportKey === 'rental-requests') return this.rentalRequests(query);
    if (reportKey === 'quotes-orders') return this.quotesOrders(query);
    if (reportKey === 'rentals-returns') return this.rentalsReturns(query);
    if (reportKey === 'inventory') return this.inventory(query);
    return this.maintenance(query);
  }

  private async requestMetrics(
    range: ResolvedReportRange,
  ): Promise<ReportMetric[]> {
    const [submitted, decisions, currentReview] = await Promise.all([
      prisma.rentalRequest.count({
        where: {
          submittedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.rentalRequestDecision.groupBy({
        _count: { _all: true },
        by: ['outcome'],
        where: {
          decidedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.rentalRequest.groupBy({
        _count: { _all: true },
        by: ['status'],
        where: {
          status: { in: ['SUBMITTED', 'RE_REVIEW_REQUIRED', 'UNDER_REVIEW'] },
        },
      }),
    ]);
    const decision = new Map(
      decisions.map((row) => [row.outcome, row._count._all]),
    );
    const current = new Map(
      currentReview.map((row) => [row.status, row._count._all]),
    );
    return [
      this.countMetric('requests_submitted', 'Requests submitted', submitted),
      this.countMetric(
        'requests_approved',
        'Decisions approved',
        decision.get('APPROVED') ?? 0,
      ),
      this.countMetric(
        'requests_partially_approved',
        'Decisions partially approved',
        decision.get('PARTIALLY_APPROVED') ?? 0,
      ),
      this.countMetric(
        'requests_rejected',
        'Decisions rejected',
        decision.get('REJECTED') ?? 0,
      ),
      {
        ...this.countMetric(
          'requests_currently_awaiting_review',
          'Currently awaiting review',
          (current.get('SUBMITTED') ?? 0) +
            (current.get('RE_REVIEW_REQUIRED') ?? 0),
        ),
        description: 'Current workload; not limited to the selected period.',
      },
    ];
  }

  private async quoteMetrics(
    range: ResolvedReportRange,
  ): Promise<ReportMetric[]> {
    const [created, sentRows, acceptedRows, viewed, superseded] =
      await Promise.all([
        prisma.quote.count({
          where: {
            createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
          },
        }),
        prisma.quoteRevisionLifecycle.findMany({
          select: {
            quoteRevision: {
              select: {
                customerResponse: { select: { response: true } },
                totalCents: true,
              },
            },
          },
          where: { sentAt: { gte: range.startUtc, lt: range.endExclusiveUtc } },
        }),
        prisma.quoteCustomerResponse.findMany({
          select: { quoteRevision: { select: { totalCents: true } } },
          where: {
            respondedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
            response: 'ACCEPTED',
          },
        }),
        prisma.quoteRevisionLifecycle.count({
          where: {
            viewedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
          },
        }),
        prisma.quoteRevisionLifecycle.count({
          where: {
            state: 'SUPERSEDED',
            terminalAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
          },
        }),
      ]);
    const acceptedSentCohort = sentRows.filter(
      (row) => row.quoteRevision.customerResponse?.response === 'ACCEPTED',
    ).length;
    return [
      this.countMetric('quotes_created', 'Quote threads created', created),
      this.countMetric('quotes_sent', 'Quote revisions sent', sentRows.length),
      this.countMetric('quotes_viewed', 'Quote revisions viewed', viewed),
      this.countMetric(
        'quotes_accepted',
        'Quotes accepted',
        acceptedRows.length,
      ),
      this.countMetric('quotes_superseded', 'Quotes superseded', superseded),
      {
        format: 'PERCENT',
        key: 'quote_acceptance_rate',
        label: 'Quote acceptance rate',
        value: sentRows.length
          ? Number(((acceptedSentCohort / sentRows.length) * 100).toFixed(1))
          : 'N/A',
        description:
          'Accepted outcomes among quote revisions sent in the selected period.',
      },
      this.moneyMetric(
        'sent_quote_value',
        'Sent quote value',
        this.sumCents(sentRows.map((row) => row.quoteRevision.totalCents)),
      ),
      this.moneyMetric(
        'accepted_quote_value',
        'Accepted quote value',
        this.sumCents(acceptedRows.map((row) => row.quoteRevision.totalCents)),
      ),
    ];
  }

  private async orderMetrics(
    range: ResolvedReportRange,
  ): Promise<ReportMetric[]> {
    const aggregate = await prisma.rentalOrder.aggregate({
      _count: { _all: true },
      _sum: { totalCents: true },
      where: {
        confirmedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
      },
    });
    return [
      this.countMetric(
        'orders_confirmed',
        'Confirmed orders',
        aggregate._count._all,
      ),
      this.moneyMetric(
        'confirmed_order_value',
        'Confirmed order value',
        aggregate._sum.totalCents ?? 0n,
      ),
    ];
  }

  private async fulfilmentMetrics(
    range: ResolvedReportRange,
  ): Promise<ReportMetric[]> {
    const [prepared, partialCheckoutRows, fullCheckout] = await Promise.all([
      prisma.orderFulfilment.count({
        where: {
          readyAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.$queryRaw<Array<{ value: bigint }>>`
        SELECT count(*)::bigint AS value
        FROM "FulfilmentOperation" current_operation
        JOIN "FulfilmentHandoff" checkout_event
          ON checkout_event."fulfilmentOperationId" = current_operation."id"
        WHERE current_operation."type" = 'CHECKOUT'
          AND checkout_event."handoffAt" >= ${range.startUtc}
          AND checkout_event."handoffAt" < ${range.endExclusiveUtc}
          AND (
            SELECT COALESCE(sum(operation_item."checkedOutDelta"), 0)
            FROM "FulfilmentOperation" prior_operation
            JOIN "FulfilmentOperationItem" operation_item
              ON operation_item."fulfilmentOperationId" = prior_operation."id"
            WHERE prior_operation."orderFulfilmentId" = current_operation."orderFulfilmentId"
              AND prior_operation."type" = 'CHECKOUT'
              AND prior_operation."resultingVersion" <= current_operation."resultingVersion"
          ) < (
            SELECT COALESCE(sum(fulfilment_item."orderedQuantitySnapshot"), 0)
            FROM "OrderFulfilmentItem" fulfilment_item
            WHERE fulfilment_item."orderFulfilmentId" = current_operation."orderFulfilmentId"
          )
      `,
      prisma.orderFulfilment.count({
        where: {
          fullyCheckedOutAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
    ]);
    const partialCheckout = Number(partialCheckoutRows[0]?.value ?? 0n);
    return [
      {
        ...this.countMetric('orders_prepared', 'Orders prepared', prepared),
        description: REPORTING_METRIC_DEFINITIONS.ordersPrepared.description,
      },
      {
        ...this.countMetric(
          'orders_partially_checked_out',
          'Partial checkout events',
          partialCheckout,
        ),
        description: REPORTING_METRIC_DEFINITIONS.partialCheckouts.description,
      },
      this.countMetric(
        'orders_fully_checked_out',
        'Full checkouts',
        fullCheckout,
      ),
    ];
  }

  private async rentalReturnMetrics(
    range: ResolvedReportRange,
  ): Promise<ReportMetric[]> {
    const now = new Date();
    const [
      activated,
      active,
      overdue,
      returnsStarted,
      returnsCompleted,
      issuesOpened,
      issuesResolved,
      partialReturns,
      reconciliationEvents,
      currentReconciliation,
      openIssues,
    ] = await Promise.all([
      prisma.activeRental.count({
        where: {
          checkedOutAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.activeRental.count({ where: { status: { not: 'COMPLETED' } } }),
      prisma.activeRental.count({
        where: { expectedReturnAt: { lt: now }, status: { not: 'COMPLETED' } },
      }),
      prisma.rentalReturn.count({
        where: {
          firstReturnAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.rentalReturn.count({
        where: {
          completedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.rentalIssue.count({
        where: {
          createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.returnActivity.count({
        where: {
          createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
          type: 'ISSUE_RESOLVED',
        },
      }),
      prisma.$queryRaw<Array<{ value: bigint }>>`
        SELECT count(*)::bigint AS value
        FROM "RentalReturnOperation" current_operation
        WHERE current_operation."receivedAt" >= ${range.startUtc}
          AND current_operation."receivedAt" < ${range.endExclusiveUtc}
          AND (
            SELECT COALESCE(sum(operation_item."quantityReceived"), 0)
            FROM "RentalReturnOperation" prior_operation
            JOIN "RentalReturnOperationItem" operation_item
              ON operation_item."returnOperationId" = prior_operation."id"
            WHERE prior_operation."rentalReturnId" = current_operation."rentalReturnId"
              AND prior_operation."resultingVersion" <= current_operation."resultingVersion"
          ) < (
            SELECT COALESCE(sum(return_item."expectedCheckedOutQuantity"), 0)
            FROM "RentalReturnItem" return_item
            WHERE return_item."rentalReturnId" = current_operation."rentalReturnId"
          )
      `,
      prisma.returnActivity.count({
        where: {
          createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
          type: 'RECONCILIATION_REQUESTED',
        },
      }),
      prisma.rentalReturn.count({
        where: { status: 'RECONCILIATION_REQUIRED' },
      }),
      prisma.rentalIssue.count({ where: { status: { not: 'RESOLVED' } } }),
    ]);
    const partialReturnEvents = Number(partialReturns[0]?.value ?? 0n);
    return [
      this.countMetric('rentals_activated', 'Rentals activated', activated),
      {
        ...this.countMetric(
          'rentals_currently_active',
          'Currently active rentals',
          active,
        ),
        description: 'Current snapshot; not limited to the selected period.',
      },
      {
        ...this.countMetric(
          'rentals_currently_overdue',
          'Currently overdue rentals',
          overdue,
        ),
        description: 'Current snapshot; not limited to the selected period.',
      },
      this.countMetric('returns_started', 'Returns started', returnsStarted),
      this.countMetric(
        'returns_completed',
        'Returns completed',
        returnsCompleted,
      ),
      {
        ...this.countMetric(
          'returns_partial',
          'Partial return events',
          partialReturnEvents,
        ),
        description: REPORTING_METRIC_DEFINITIONS.partialReturns.description,
      },
      this.countMetric(
        'return_reconciliation_events',
        'Reconciliation requested events',
        reconciliationEvents,
      ),
      {
        ...this.countMetric(
          'returns_currently_requiring_reconciliation',
          'Currently requiring reconciliation',
          currentReconciliation,
        ),
        description:
          REPORTING_METRIC_DEFINITIONS.reconciliationCurrent.description,
      },
      this.countMetric('issues_opened', 'Issues opened', issuesOpened),
      this.countMetric('issues_resolved', 'Issues resolved', issuesResolved),
      {
        ...this.countMetric(
          'issues_currently_open',
          'Currently open issues',
          openIssues,
        ),
        description: 'Current snapshot; not limited to the selected period.',
      },
    ];
  }

  private async maintenanceMetrics(
    range: ResolvedReportRange,
  ): Promise<ReportMetric[]> {
    const [
      created,
      completed,
      cancelled,
      inspections,
      open,
      waiting,
      overdue,
      byPriority,
      byType,
      scheduledInspections,
    ] = await Promise.all([
      prisma.maintenanceWorkOrder.count({
        where: {
          createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.maintenanceWorkOrder.findMany({
        select: { completedAt: true, createdAt: true },
        where: {
          completedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.maintenanceWorkOrder.count({
        where: {
          cancelledAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.equipmentInspection.groupBy({
        _count: { _all: true },
        by: ['result'],
        where: {
          completedAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.maintenanceWorkOrder.count({
        where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
      }),
      prisma.maintenanceWorkOrder.count({
        where: { status: 'WAITING_FOR_PARTS' },
      }),
      prisma.maintenanceWorkOrder.count({
        where: {
          dueAt: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      prisma.maintenanceWorkOrder.groupBy({
        _count: { _all: true },
        by: ['priority'],
        where: {
          createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.maintenanceWorkOrder.groupBy({
        _count: { _all: true },
        by: ['type'],
        where: {
          createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
      prisma.equipmentInspection.count({
        where: {
          createdAt: { gte: range.startUtc, lt: range.endExclusiveUtc },
        },
      }),
    ]);
    const inspection = new Map(
      inspections.map((row) => [row.result, row._count._all]),
    );
    const averageHours = completed.length
      ? completed.reduce(
          (sum, row) =>
            sum +
            (row.completedAt!.getTime() - row.createdAt.getTime()) / 3_600_000,
          0,
        ) / completed.length
      : null;
    return [
      this.countMetric('maintenance_created', 'Work orders created', created),
      this.countMetric(
        'maintenance_completed',
        'Work orders completed',
        completed.length,
      ),
      this.countMetric(
        'maintenance_cancelled',
        'Work orders cancelled',
        cancelled,
      ),
      {
        ...this.countMetric(
          'maintenance_currently_open',
          'Currently open work',
          open,
        ),
        description: 'Current snapshot; not limited to the selected period.',
      },
      {
        ...this.countMetric(
          'maintenance_waiting_for_parts',
          'Waiting for parts',
          waiting,
        ),
        description: 'Current snapshot; not limited to the selected period.',
      },
      {
        ...this.countMetric('maintenance_overdue', 'Overdue work', overdue),
        description: 'Current snapshot; not limited to the selected period.',
      },
      ...byPriority.map((row) =>
        this.countMetric(
          `maintenance_priority_${row.priority.toLowerCase()}`,
          `${this.titleCase(row.priority)} priority`,
          row._count._all,
        ),
      ),
      ...byType.map((row) =>
        this.countMetric(
          `maintenance_type_${row.type.toLowerCase()}`,
          `${this.titleCase(row.type)} work`,
          row._count._all,
        ),
      ),
      {
        format: 'DURATION',
        key: 'maintenance_average_completion_hours',
        label: 'Average completion time',
        value: averageHours === null ? 'N/A' : Number(averageHours.toFixed(1)),
        description:
          'Average hours from creation to completion for work completed in the period.',
      },
      this.countMetric(
        'inspections_passed',
        'Inspections passed',
        inspection.get('PASSED') ?? 0,
      ),
      {
        ...this.countMetric(
          'inspections_scheduled',
          'Inspections scheduled',
          scheduledInspections,
        ),
        description:
          REPORTING_METRIC_DEFINITIONS.inspectionsScheduled.description,
      },
      this.countMetric(
        'inspections_performed',
        'Inspections performed',
        (inspection.get('PASSED') ?? 0) + (inspection.get('FAILED') ?? 0),
      ),
      this.countMetric(
        'inspections_failed',
        'Inspections failed',
        inspection.get('FAILED') ?? 0,
      ),
      {
        format: 'PERCENT',
        key: 'inspection_failure_rate',
        label: 'Inspection failure rate',
        value:
          (inspection.get('PASSED') ?? 0) + (inspection.get('FAILED') ?? 0)
            ? Number(
                (
                  ((inspection.get('FAILED') ?? 0) /
                    ((inspection.get('PASSED') ?? 0) +
                      (inspection.get('FAILED') ?? 0))) *
                  100
                ).toFixed(1),
              )
            : 'N/A',
      },
    ];
  }

  private async requestVolumeSeries(range: ResolvedReportRange) {
    const rows = await prisma.$queryRaw<Array<{ date: string; value: bigint }>>`
      SELECT to_char(("submittedAt" AT TIME ZONE ${this.timeZone})::date, 'YYYY-MM-DD') AS date,
             count(*)::bigint AS value
      FROM "RentalRequest"
      WHERE "submittedAt" >= ${range.startUtc} AND "submittedAt" < ${range.endExclusiveUtc}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return {
      key: 'rental_requests_over_time',
      label: 'Rental requests over time',
      description: `Submitted requests by ${this.timeZone} calendar date.`,
      points: rows.map((row) => ({ date: row.date, value: Number(row.value) })),
    };
  }

  private async physicalStateMetrics(): Promise<ReportMetric[]> {
    const [bulkTo, bulkFrom, serialized] = await Promise.all([
      prisma.inventoryTransaction.groupBy({
        _sum: { quantity: true },
        by: ['toState'],
        where: { inventory: { trackingMode: 'BULK' }, toState: { not: null } },
      }),
      prisma.inventoryTransaction.groupBy({
        _sum: { quantity: true },
        by: ['fromState'],
        where: {
          fromState: { not: null },
          inventory: { trackingMode: 'BULK' },
        },
      }),
      prisma.inventoryItem.groupBy({ _count: { _all: true }, by: ['status'] }),
    ]);
    const totals = new Map<string, number>(STATES.map((state) => [state, 0]));
    for (const row of bulkTo)
      if (row.toState)
        totals.set(
          row.toState,
          (totals.get(row.toState) ?? 0) + (row._sum.quantity ?? 0),
        );
    for (const row of bulkFrom)
      if (row.fromState)
        totals.set(
          row.fromState,
          (totals.get(row.fromState) ?? 0) - (row._sum.quantity ?? 0),
        );
    for (const row of serialized)
      totals.set(row.status, (totals.get(row.status) ?? 0) + row._count._all);
    return STATES.map((state) => ({
      description:
        'Current physical state; reservation commitments are reported separately.',
      format: 'COUNT' as const,
      key: `inventory_${state.toLowerCase()}`,
      label: state.replaceAll('_', ' '),
      value: totals.get(state) ?? 0,
    }));
  }

  private async assertLivePermissions(
    actorId: string,
    required: readonly string[],
  ) {
    const rows = await prisma.user.findFirst({
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
      where: { id: actorId, status: 'ACTIVE' },
    });
    const effective = new Set(
      rows?.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key),
      ) ?? [],
    );
    if (!required.every((key) => effective.has(key)))
      throw new ForbiddenException('Insufficient permissions');
  }

  private requiredPermissions(key: ReportKey) {
    if (key === 'rental-requests') return ['rental_request.view'];
    if (key === 'quotes-orders') return ['quote.view', 'order.view'];
    if (key === 'rentals-returns')
      return ['active_rental.view', 'return.view', 'rental_issue.view'];
    if (key === 'inventory')
      return [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.transaction.view',
      ];
    return ['maintenance.view', 'inspection.view'];
  }

  private safeFilterSummary(query: Record<string, unknown>) {
    const allowed = new Set([
      'status',
      'quoteStatus',
      'recordType',
      'overdue',
      'action',
      'categoryId',
      'productId',
      'trackingMode',
      'priority',
    ]);
    return Object.fromEntries(
      Object.entries(query).filter(
        ([key, value]) => allowed.has(key) && value !== undefined,
      ),
    );
  }

  private range(
    query: Pick<ReportOverviewQuery, 'preset' | 'startDate' | 'endDate'>,
  ) {
    return resolveReportRange(query, this.timeZone, this.maxDays);
  }

  private rangeDto(range: ResolvedReportRange) {
    return {
      endDate: range.endDate,
      label: `${range.startDate} to ${range.endDate}`,
      startDate: range.startDate,
      timeZone: range.timeZone,
    };
  }

  private page(
    range: ResolvedReportRange,
    metrics: ReportMetric[],
    items: ReportItem[],
    page: number,
    pageSize: number,
    total: number,
  ) {
    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
      metrics,
      range: this.rangeDto(range),
      series: [] as const,
    };
  }

  private countMetric(key: string, label: string, value: number): ReportMetric {
    return { format: 'COUNT', key, label, value };
  }

  private moneyMetric(key: string, label: string, value: bigint): ReportMetric {
    return {
      currency: 'CAD',
      format: 'MONEY',
      key,
      label,
      value: value.toString(),
    };
  }

  private sumCents(values: readonly bigint[]) {
    return values.reduce((sum, value) => sum + value, 0n);
  }

  private hasAll(current: readonly string[], ...required: string[]) {
    const permissions = new Set(current);
    return required.every((key) => permissions.has(key));
  }

  private maskEmail(email: string) {
    const [local, domain] = email.split('@');
    return `${local?.slice(0, 1) ?? '*'}***@${domain ?? 'hidden'}`;
  }

  private dateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private titleCase(value: string) {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  private boundedEnvironmentNumber(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value = Number(process.env[name] ?? fallback);
    return Number.isInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  }

  private cuidLike() {
    // Database default generation is unavailable to raw SQL; this stays opaque and collision-resistant.
    return `c${randomUUID().replaceAll('-', '')}`;
  }
}
