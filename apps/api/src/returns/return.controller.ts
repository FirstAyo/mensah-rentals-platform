import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  createRentalIssueSchema,
  cuidParamSchema,
  issueListQuerySchema,
  recordReturnSchema,
  resolveRentalIssueSchema,
  returnListQuerySchema,
  returnVersionCommandSchema,
  type CreateRentalIssueInput,
  type IssueListQuery,
  type RecordReturnInput,
  type ResolveRentalIssueInput,
  type ReturnListQuery,
  type ReturnVersionCommandInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireFeature } from '../feature-settings/requires-feature.decorator';
import { FeatureSettingsService } from '../feature-settings/feature-settings.service';
import { RentalOrderNoStoreInterceptor } from '../rental-order/rental-order-no-store.interceptor';
import { RentalOrderZodPipe } from '../rental-order/rental-order-zod.pipe';
import { ReturnService } from './return.service';

@Controller('admin/active-rentals/:activeRentalId/return')
@RequireFeature('RETURNS')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminActiveRentalReturnController {
  constructor(
    @Inject(ReturnService) private readonly returns: ReturnService,
    @Inject(FeatureSettingsService)
    private readonly features: FeatureSettingsService,
  ) {}

  @Get()
  @RequirePermissions('return.view')
  get(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('activeRentalId', new RentalOrderZodPipe(cuidParamSchema))
    activeRentalId: string,
  ): Promise<unknown> {
    return this.returns.forActiveRental(actor.id, activeRentalId);
  }

  @Post()
  @RequirePermissions('return.create', 'return.inspect')
  async record(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('activeRentalId', new RentalOrderZodPipe(cuidParamSchema))
    activeRentalId: string,
    @Body(new RentalOrderZodPipe(recordReturnSchema)) input: RecordReturnInput,
  ): Promise<unknown> {
    if (requiresIssueHandling(input))
      await this.features.assertAvailable('DAMAGED_RETURN_HANDLING', 'ADMIN');
    return this.returns.record(actor.id, activeRentalId, input);
  }
}

@Controller('admin/returns')
@RequireFeature('RETURNS')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminReturnController {
  constructor(
    @Inject(ReturnService) private readonly returns: ReturnService,
    @Inject(FeatureSettingsService)
    private readonly features: FeatureSettingsService,
  ) {}

  @Get()
  @RequirePermissions('return.view')
  list(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new RentalOrderZodPipe(returnListQuerySchema))
    query: ReturnListQuery,
  ): Promise<unknown> {
    return this.returns.list(actor.id, query);
  }

  @Get(':id')
  @RequirePermissions('return.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ): Promise<unknown> {
    return this.returns.detail(actor.id, id);
  }

  @Post(':id/operations')
  @RequirePermissions('return.create', 'return.inspect')
  async operation(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(recordReturnSchema)) input: RecordReturnInput,
  ): Promise<unknown> {
    if (requiresIssueHandling(input))
      await this.features.assertAvailable('DAMAGED_RETURN_HANDLING', 'ADMIN');
    return this.returns
      .detail(actor.id, id)
      .then((current) =>
        this.returns.record(actor.id, current.activeRentalId, input),
      );
  }

  @Post(':id/reconcile')
  @RequirePermissions('return.reconcile')
  reconcile(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(returnVersionCommandSchema))
    input: ReturnVersionCommandInput,
  ): Promise<unknown> {
    return this.returns.reconcile(actor.id, id, input);
  }

  @Post(':id/complete')
  @RequirePermissions('return.reconcile', 'return.complete')
  complete(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(returnVersionCommandSchema))
    input: ReturnVersionCommandInput,
  ): Promise<unknown> {
    return this.returns.complete(actor.id, id, input);
  }

  @Post(':id/issues')
  @RequirePermissions('rental_issue.update')
  async createIssue(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(createRentalIssueSchema))
    input: CreateRentalIssueInput,
  ): Promise<unknown> {
    await this.features.assertAvailable('DAMAGED_RETURN_HANDLING', 'ADMIN');
    return this.returns.createManualIssue(actor.id, id, input);
  }

  @Get(':id/official-pdf')
  @RequirePermissions('return.view', 'return.pdf')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', 'sandbox')
  async officialPdf(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ) {
    const result = await this.returns.officialPdf(actor.id, id);
    return new StreamableFile(result.buffer, {
      disposition: `attachment; filename="${result.filename}"`,
      type: 'application/pdf',
    });
  }

  @Get(':id/:kind')
  @RequirePermissions('return.view', 'return.pdf')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', 'sandbox')
  async pdf(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Param('kind') kind: string,
  ) {
    const allowed = [
      'receipt-pdf',
      'inspection-pdf',
      'missing-pdf',
      'damage-pdf',
      'reconciliation-pdf',
    ] as const;
    if (!allowed.includes(kind as (typeof allowed)[number]))
      throw new NotFoundException('Return document not found');
    const result = await this.returns.pdf(
      actor.id,
      id,
      kind.replace('-pdf', '') as
        | 'receipt'
        | 'inspection'
        | 'missing'
        | 'damage'
        | 'reconciliation',
    );
    return new StreamableFile(result.buffer, {
      disposition: `attachment; filename="${result.filename}"`,
      type: 'application/pdf',
    });
  }
}

function requiresIssueHandling(input: RecordReturnInput) {
  return input.items.some(
    (item) =>
      item.quantityDamaged > 0 ||
      item.quantityMaintenance > 0 ||
      item.quantityMissing > 0 ||
      item.externalQuantityMissing > 0,
  );
}

@Controller('admin/rental-issues')
@RequireFeature('DAMAGED_RETURN_HANDLING')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminRentalIssueController {
  constructor(@Inject(ReturnService) private readonly returns: ReturnService) {}

  @Get()
  @RequirePermissions('rental_issue.view')
  list(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new RentalOrderZodPipe(issueListQuerySchema)) query: IssueListQuery,
  ): Promise<unknown> {
    return this.returns.issueList(actor.id, query);
  }

  @Get(':id')
  @RequirePermissions('rental_issue.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ): Promise<unknown> {
    return this.returns.issueDetail(actor.id, id);
  }

  @Post(':id/resolutions')
  @RequirePermissions('rental_issue.resolve', 'return.reconcile')
  resolve(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(resolveRentalIssueSchema))
    input: ResolveRentalIssueInput,
  ): Promise<unknown> {
    return this.returns.resolveIssue(actor.id, id, input);
  }
}
