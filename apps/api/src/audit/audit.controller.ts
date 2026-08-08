import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
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
import { PrivateNoStoreInterceptor } from '../common/private-no-store.interceptor';
import type { CorrelatedRequest } from '../common/request-correlation';
import { AuditService } from './audit.service';
import {
  auditDetailParamSchema,
  auditQuerySchema,
  AuditValidationPipe,
  type AuditDetailParam,
  type AuditQuery,
} from './audit.schemas';

const AUDIT_EXPORT = 'audit_log.export' as PermissionKey;

@Controller('admin/audit')
@UseInterceptors(PrivateNoStoreInterceptor)
export class AuditController {
  private readonly logger = new Logger(AuditController.name);
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit_log.view')
  list(@Query(new AuditValidationPipe(auditQuerySchema)) query: AuditQuery) {
    return this.audit.list(query);
  }

  @Get(':source/:id')
  @RequirePermissions('audit_log.view')
  detail(
    @Param(new AuditValidationPipe(auditDetailParamSchema))
    param: AuditDetailParam,
  ) {
    return this.audit.detail(param);
  }

  @Post('export')
  @RequirePermissions('audit_log.view', AUDIT_EXPORT)
  async export(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new AuditValidationPipe(auditQuerySchema)) query: AuditQuery,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    let result;
    try {
      result = await this.audit.export(
        actor.id,
        actor.permissionKeys,
        query,
        (request as CorrelatedRequest).requestId,
      );
    } catch (error) {
      this.logger.warn({
        errorClass: error instanceof Error ? error.constructor.name : 'Unknown',
        event: 'audit_export_failed',
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
