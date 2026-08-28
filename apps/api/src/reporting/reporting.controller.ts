import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PermissionKey } from '@mensah-rentals/rbac';
import type { StaffUserResponse } from '@mensah-rentals/types';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireFeature } from '../feature-settings/requires-feature.decorator';
import type { CorrelatedRequest } from '../common/request-correlation';
import { PrivateNoStoreInterceptor } from '../common/private-no-store.interceptor';
import { ReportingService } from './reporting.service';
import {
  inventoryReportQuerySchema,
  maintenanceReportQuerySchema,
  quoteOrderReportQuerySchema,
  rentalRequestReportQuerySchema,
  rentalsReturnsReportQuerySchema,
  reportOverviewQuerySchema,
  ReportingValidationPipe,
  type InventoryReportQuery,
  type MaintenanceReportQuery,
  type QuoteOrderReportQuery,
  type RentalRequestReportQuery,
  type RentalsReturnsReportQuery,
  type ReportOverviewQuery,
} from './reporting.schemas';

const REPORT_EXPORT = 'report.export' as PermissionKey;

@Controller('admin/reports')
@RequireFeature('OPERATIONAL_REPORTING')
@UseInterceptors(PrivateNoStoreInterceptor)
export class ReportingController {
  private readonly logger = new Logger(ReportingController.name);
  constructor(
    @Inject(ReportingService)
    private readonly reporting: ReportingService,
  ) {}

  @Get('overview')
  @RequirePermissions('report.view')
  overview(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new ReportingValidationPipe(reportOverviewQuerySchema))
    query: ReportOverviewQuery,
  ) {
    return this.reporting.overview(query, actor.permissionKeys);
  }

  @Get('rental-requests')
  @RequirePermissions('report.view', 'rental_request.view')
  rentalRequests(
    @Query(new ReportingValidationPipe(rentalRequestReportQuerySchema))
    query: RentalRequestReportQuery,
  ) {
    return this.reporting.rentalRequests(query);
  }

  @Post('rental-requests/export')
  @RequirePermissions('report.view', REPORT_EXPORT, 'rental_request.view')
  async exportRentalRequests(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ReportingValidationPipe(rentalRequestReportQuerySchema))
    query: RentalRequestReportQuery,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.export(actor, 'rental-requests', query, request, response);
  }

  @Get('quotes-orders')
  @RequirePermissions('report.view', 'quote.view', 'order.view')
  quotesOrders(
    @Query(new ReportingValidationPipe(quoteOrderReportQuerySchema))
    query: QuoteOrderReportQuery,
  ) {
    return this.reporting.quotesOrders(query);
  }

  @Post('quotes-orders/export')
  @RequirePermissions('report.view', REPORT_EXPORT, 'quote.view', 'order.view')
  async exportQuotesOrders(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ReportingValidationPipe(quoteOrderReportQuerySchema))
    query: QuoteOrderReportQuery,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.export(actor, 'quotes-orders', query, request, response);
  }

  @Get('rentals-returns')
  @RequirePermissions(
    'report.view',
    'active_rental.view',
    'return.view',
    'rental_issue.view',
  )
  rentalsReturns(
    @Query(new ReportingValidationPipe(rentalsReturnsReportQuerySchema))
    query: RentalsReturnsReportQuery,
  ) {
    return this.reporting.rentalsReturns(query);
  }

  @Post('rentals-returns/export')
  @RequirePermissions(
    'report.view',
    REPORT_EXPORT,
    'active_rental.view',
    'return.view',
    'rental_issue.view',
  )
  async exportRentalsReturns(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ReportingValidationPipe(rentalsReturnsReportQuerySchema))
    query: RentalsReturnsReportQuery,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.export(actor, 'rentals-returns', query, request, response);
  }

  @Get('inventory')
  @RequirePermissions(
    'report.view',
    'inventory.view',
    'inventory.quantity.view',
    'inventory.transaction.view',
  )
  inventory(
    @Query(new ReportingValidationPipe(inventoryReportQuerySchema))
    query: InventoryReportQuery,
  ) {
    return this.reporting.inventory(query);
  }

  @Post('inventory/export')
  @RequirePermissions(
    'report.view',
    REPORT_EXPORT,
    'inventory.view',
    'inventory.quantity.view',
    'inventory.transaction.view',
  )
  async exportInventory(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ReportingValidationPipe(inventoryReportQuerySchema))
    query: InventoryReportQuery,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.export(actor, 'inventory', query, request, response);
  }

  @Get('maintenance')
  @RequirePermissions('report.view', 'maintenance.view', 'inspection.view')
  maintenance(
    @Query(new ReportingValidationPipe(maintenanceReportQuerySchema))
    query: MaintenanceReportQuery,
  ) {
    return this.reporting.maintenance(query);
  }

  @Post('maintenance/export')
  @RequirePermissions(
    'report.view',
    REPORT_EXPORT,
    'maintenance.view',
    'inspection.view',
  )
  async exportMaintenance(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ReportingValidationPipe(maintenanceReportQuerySchema))
    query: MaintenanceReportQuery,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.export(actor, 'maintenance', query, request, response);
  }

  private async export(
    actor: StaffUserResponse,
    reportKey:
      | 'rental-requests'
      | 'quotes-orders'
      | 'rentals-returns'
      | 'inventory'
      | 'maintenance',
    query:
      | RentalRequestReportQuery
      | QuoteOrderReportQuery
      | RentalsReturnsReportQuery
      | InventoryReportQuery
      | MaintenanceReportQuery,
    request: Request,
    response: Response,
  ) {
    let result;
    try {
      result = await this.reporting.exportReport(
        actor.id,
        actor.permissionKeys,
        reportKey,
        query,
        (request as CorrelatedRequest).requestId,
      );
    } catch (error) {
      this.logger.warn({
        errorClass: error instanceof Error ? error.constructor.name : 'Unknown',
        event: 'report_export_failed',
        reportKey,
        requestId: (request as CorrelatedRequest).requestId,
      });
      throw error;
    }
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    response.setHeader('X-Report-Row-Count', String(result.rowCount));
    return result.csv;
  }
}
