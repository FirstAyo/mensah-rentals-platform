import { randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma } from '@mensah-rentals/database';

import { createCsv, safeReportFilename } from '../reporting/csv-export';
import { resolveReportRange } from '../reporting/report-date-range';
import type { AuditDetailParam, AuditQuery } from './audit.schemas';

interface AuditProjectionRow {
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  domain: string;
  entity_id: string | null;
  entity_reference: string | null;
  entity_type: string | null;
  id: string;
  occurred_at: Date;
  source: string;
  summary: string;
}

const AUDIT_UNION = Prisma.sql`
  SELECT 'PLATFORM'::text source, pae."id", pae."occurredAt" occurred_at,
    pae."actorUserId" actor_id,
    CASE WHEN u."id" IS NULL THEN NULL ELSE u."firstName" || ' ' || u."lastName" END actor_name,
    pae."domain", pae."action", pae."entityType" entity_type, pae."entityId" entity_id,
    pae."entityReference" entity_reference, pae."summary"
  FROM "PlatformAuditEvent" pae LEFT JOIN "User" u ON u."id" = pae."actorUserId"
  UNION ALL
  SELECT 'RENTAL_REQUEST', a."id", a."createdAt", a."actorUserId",
    CASE WHEN u."id" IS NULL THEN NULL ELSE u."firstName" || ' ' || u."lastName" END,
    'RENTAL_REQUEST', a."type"::text, 'RENTAL_REQUEST', r."id", r."referenceNumber",
    'Rental request ' || r."referenceNumber" || ' recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "RentalRequestActivity" a JOIN "RentalRequest" r ON r."id" = a."rentalRequestId"
    LEFT JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'QUOTE', a."id", a."createdAt", a."actorUserId",
    CASE WHEN u."id" IS NULL THEN NULL ELSE u."firstName" || ' ' || u."lastName" END,
    'QUOTE', a."type"::text, 'QUOTE', q."id", q."quoteNumber",
    'Quote ' || q."quoteNumber" || ' recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "QuoteActivity" a JOIN "Quote" q ON q."id" = a."quoteId"
    LEFT JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'ORDER', a."id", a."createdAt", a."actorUserId",
    CASE WHEN u."id" IS NULL THEN NULL ELSE u."firstName" || ' ' || u."lastName" END,
    'ORDER', a."type"::text, 'RENTAL_ORDER', o."id", o."orderNumber",
    'Rental order ' || o."orderNumber" || ' recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "RentalOrderActivity" a JOIN "RentalOrder" o ON o."id" = a."rentalOrderId"
    LEFT JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'RESERVATION', a."id", a."createdAt", a."actorUserId", u."firstName" || ' ' || u."lastName",
    'RESERVATION', a."type"::text, 'INVENTORY_RESERVATION', r."id", r."reservationNumber",
    'Reservation ' || r."reservationNumber" || ' recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "InventoryReservationOperation" a JOIN "InventoryReservation" r ON r."id" = a."inventoryReservationId"
    JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'FULFILMENT', a."id", a."createdAt", a."actorUserId", u."firstName" || ' ' || u."lastName",
    'FULFILMENT', a."type"::text, 'ORDER_FULFILMENT', f."id", o."orderNumber",
    'Fulfilment for ' || o."orderNumber" || ' recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "FulfilmentOperation" a JOIN "OrderFulfilment" f ON f."id" = a."orderFulfilmentId"
    JOIN "RentalOrder" o ON o."id" = f."rentalOrderId" JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'INVENTORY', a."id", a."createdAt", a."actorUserId", u."firstName" || ' ' || u."lastName",
    'INVENTORY', a."action"::text, 'INVENTORY', i."id", p."name",
    'Inventory movement for ' || p."name" || ' recorded ' || replace(a."action"::text, '_', ' ') || '.'
  FROM "InventoryTransaction" a JOIN "Inventory" i ON i."id" = a."inventoryId"
    JOIN "Product" p ON p."id" = i."productId" JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'RETURN', a."id", a."createdAt", a."actorUserId", u."firstName" || ' ' || u."lastName",
    'RETURN', a."type"::text, 'RENTAL_RETURN', r."id", r."returnNumber",
    'Return ' || r."returnNumber" || ' recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "ReturnActivity" a JOIN "RentalReturn" r ON r."id" = a."rentalReturnId"
    JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'MAINTENANCE', a."id", a."createdAt", a."actorUserId", u."firstName" || ' ' || u."lastName",
    CASE WHEN a."inspectionId" IS NULL THEN 'MAINTENANCE' ELSE 'INSPECTION' END,
    a."type"::text,
    CASE WHEN a."inspectionId" IS NULL THEN 'MAINTENANCE_WORK_ORDER' ELSE 'EQUIPMENT_INSPECTION' END,
    COALESCE(a."workOrderId", a."inspectionId"), COALESCE(w."workOrderNumber", i."inspectionNumber"),
    CASE WHEN w."id" IS NOT NULL THEN 'Maintenance work order ' || w."workOrderNumber"
      ELSE 'Inspection ' || i."inspectionNumber" END || ' recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "MaintenanceOperation" a LEFT JOIN "MaintenanceWorkOrder" w ON w."id" = a."workOrderId"
    LEFT JOIN "EquipmentInspection" i ON i."id" = a."inspectionId" JOIN "User" u ON u."id" = a."actorUserId"
  UNION ALL
  SELECT 'HOMEPAGE', a."id", a."createdAt", a."actorUserId", u."firstName" || ' ' || u."lastName",
    'HOMEPAGE', a."type"::text, 'HOMEPAGE', a."homepageId", NULL,
    'Homepage recorded ' || replace(a."type"::text, '_', ' ') || '.'
  FROM "HomepageActivity" a JOIN "User" u ON u."id" = a."actorUserId"
`;

@Injectable()
export class AuditService {
  private readonly timeZone = process.env.REPORTING_TIME_ZONE ?? 'Africa/Accra';
  private readonly maxDays = this.envNumber('REPORT_EXPORT_MAX_DAYS', 366);
  private readonly maxRows = this.envNumber('REPORT_EXPORT_MAX_ROWS', 10_000);

  async list(query: AuditQuery) {
    const range = resolveReportRange(query, this.timeZone, this.maxDays);
    const filters = this.filters(query, range.startUtc, range.endExclusiveUtc);
    const where = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
    const direction =
      query.sortDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const offset = (query.page - 1) * query.pageSize;
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<AuditProjectionRow[]>(Prisma.sql`
        SELECT * FROM (${AUDIT_UNION}) audit ${where}
        ORDER BY occurred_at ${direction}, source ${direction}, id ${direction}
        LIMIT ${query.pageSize} OFFSET ${offset}
      `),
      prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint total FROM (${AUDIT_UNION}) audit ${where}
      `),
    ]);
    const total = Number(countRows[0]?.total ?? 0n);
    return {
      items: rows.map((row) => this.map(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
      range: {
        endDate: range.endDate,
        startDate: range.startDate,
        timeZone: range.timeZone,
      },
    };
  }

  async detail(param: AuditDetailParam) {
    const rows = await prisma.$queryRaw<AuditProjectionRow[]>(Prisma.sql`
      SELECT * FROM (${AUDIT_UNION}) audit
      WHERE source = ${param.source} AND id = ${param.id}
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Audit event was not found');
    return { ...this.map(rows[0]), metadata: null };
  }

  async export(
    actorId: string,
    actorPermissionKeys: readonly string[],
    query: AuditQuery,
    requestId?: string,
  ) {
    if (
      !actorPermissionKeys.includes('audit_log.view') ||
      !actorPermissionKeys.includes('audit_log.export')
    )
      throw new ForbiddenException('Insufficient permissions');
    await this.assertLivePermissions(actorId);
    const first = await this.list({ ...query, page: 1, pageSize: 100 });
    if (first.meta.total > this.maxRows)
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message: `This export exceeds ${this.maxRows} rows. Narrow the filters and try again.`,
        statusCode: 422,
      });
    const items = [...first.items];
    for (let page = 2; items.length < first.meta.total; page += 1) {
      const next = await this.list({ ...query, page, pageSize: 100 });
      items.push(...next.items);
    }
    // Permission revocation must take effect even while a multi-page export is
    // being assembled. Do not generate CSV or record a successful export after
    // the actor loses either required permission.
    await this.assertLivePermissions(actorId);
    const csv = createCsv(
      ['Time', 'Actor', 'Domain', 'Action', 'Reference', 'Summary'],
      items.map((item) => [
        item.occurredAt,
        item.actor?.name ?? 'System',
        item.domain,
        item.action,
        item.entity?.reference ?? '',
        item.summary,
      ]),
    );
    await prisma.$executeRaw`
      INSERT INTO "PlatformAuditEvent"
        ("id", "occurredAt", "actorUserId", "domain", "action", "entityType", "entityReference", "summary", "metadata", "requestId", "createdAt")
      VALUES
        (${`c${randomUUID().replaceAll('-', '')}`}, NOW(), ${actorId}, 'AUDIT', 'AUDIT_EXPORT_GENERATED', 'AUDIT_HISTORY', 'audit-history',
         ${`Exported ${items.length} audit-history rows.`},
         ${JSON.stringify({ endDate: first.range.endDate, filters: this.safeFilterSummary(query), rowCount: items.length, startDate: first.range.startDate })}::jsonb,
         ${requestId ?? null}, NOW())
    `;
    return {
      csv,
      filename: safeReportFilename(
        'audit-history',
        first.range.startDate,
        first.range.endDate,
      ),
      rowCount: items.length,
    };
  }

  private filters(query: AuditQuery, start: Date, end: Date) {
    const filters: Prisma.Sql[] = [
      Prisma.sql`occurred_at >= ${start}`,
      Prisma.sql`occurred_at < ${end}`,
    ];
    if (query.actorUserId)
      filters.push(Prisma.sql`actor_id = ${query.actorUserId}`);
    if (query.domain) filters.push(Prisma.sql`domain = ${query.domain}`);
    if (query.action) filters.push(Prisma.sql`action = ${query.action}`);
    if (query.search) {
      const search = `%${query.search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      filters.push(
        Prisma.sql`(entity_reference ILIKE ${search} ESCAPE '\\' OR summary ILIKE ${search} ESCAPE '\\')`,
      );
    }
    return filters;
  }

  private safeFilterSummary(query: AuditQuery) {
    return Object.fromEntries(
      Object.entries(query).filter(
        ([key, value]) =>
          ['action', 'domain', 'entityType', 'source', 'actorUserId'].includes(
            key,
          ) && value !== undefined,
      ),
    );
  }

  private map(row: AuditProjectionRow) {
    return {
      action: row.action,
      actor:
        row.actor_id && row.actor_name
          ? { id: row.actor_id, name: row.actor_name }
          : null,
      domain: row.domain,
      entity: row.entity_type
        ? {
            ...(row.entity_id ? { id: row.entity_id } : {}),
            ...(row.entity_reference
              ? { reference: row.entity_reference }
              : {}),
            type: row.entity_type,
          }
        : null,
      id: row.id,
      occurredAt: row.occurred_at.toISOString(),
      source: row.source,
      summary: row.summary,
    };
  }

  private async assertLivePermissions(actorId: string) {
    const user = await prisma.user.findFirst({
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
    const permissions = new Set(
      user?.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key),
      ) ?? [],
    );
    if (
      !permissions.has('audit_log.view') ||
      !permissions.has('audit_log.export')
    )
      throw new ForbiddenException('Insufficient permissions');
  }

  private envNumber(name: string, fallback: number) {
    const value = Number(process.env[name] ?? fallback);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
