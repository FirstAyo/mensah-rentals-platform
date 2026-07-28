import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  approveRentalRequestDecisionSchema,
  createRentalRequestInternalNoteSchema,
  cuidParamSchema,
  partiallyApproveRentalRequestDecisionSchema,
  rejectRentalRequestDecisionSchema,
  rentalRequestAdminListQuerySchema,
  unassignRentalRequestSchema,
  updateRentalRequestAssignmentSchema,
  updateRentalRequestReviewStateSchema,
  type AdminRentalRequestListQuery,
  type ApproveRentalRequestDecisionInput,
  type CreateRentalRequestInternalNoteInput,
  type PartiallyApproveRentalRequestDecisionInput,
  type RejectRentalRequestDecisionInput,
  type UnassignRentalRequestInput,
  type UpdateRentalRequestAssignmentInput,
  type UpdateRentalRequestReviewStateInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AdminRentalRequestNoStoreInterceptor } from './admin-rental-request-no-store.interceptor';
import { AdminRentalRequestService } from './admin-rental-request.service';
import { RentalRequestDecisionService } from './rental-request-decision.service';
import { RentalRequestRevisionService } from './rental-request-revision.service';

@Controller('admin/rental-requests')
@UseInterceptors(AdminRentalRequestNoStoreInterceptor)
export class AdminRentalRequestController {
  constructor(
    @Inject(AdminRentalRequestService)
    private readonly requests: AdminRentalRequestService,
    @Inject(RentalRequestDecisionService)
    private readonly decisions: RentalRequestDecisionService,
    @Inject(RentalRequestRevisionService)
    private readonly revisions: RentalRequestRevisionService,
  ) {}

  @Get()
  @RequirePermissions('rental_request.view')
  list(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new ZodBodyPipe(rentalRequestAdminListQuerySchema))
    query: AdminRentalRequestListQuery,
  ) {
    return this.requests.list(actor, query);
  }

  @Get(':id/revisions')
  @RequirePermissions('rental_request_revision.view')
  revisionsList(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.revisions.list(id);
  }

  @Get(':id/revisions/:revisionId')
  @RequirePermissions('rental_request_revision.view')
  revisionDetail(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new ZodBodyPipe(cuidParamSchema)) revisionId: string,
  ) {
    return this.revisions.detail(id, revisionId);
  }

  @Get(':id/revisions/:revisionId/comparison')
  @RequirePermissions('rental_request_revision.view')
  revisionComparison(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new ZodBodyPipe(cuidParamSchema)) revisionId: string,
  ) {
    return this.revisions.comparison(id, revisionId);
  }

  @Get('assignees')
  @RequirePermissions('rental_request.view', 'rental_request.assign')
  assignees() {
    return this.requests.assignees();
  }

  @Get(':id')
  @RequirePermissions('rental_request.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
  ) {
    return this.requests.detail(actor, id);
  }

  @Get(':id/decision')
  @RequirePermissions('rental_request.view')
  decision(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.decisions.current(id);
  }

  @Get(':id/decisions')
  @RequirePermissions('rental_request.view')
  decisionHistory(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.decisions.history(id);
  }

  @Post(':id/decisions/approve')
  @RequirePermissions('rental_request.view', 'rental_request.approve')
  approve(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(approveRentalRequestDecisionSchema))
    input: ApproveRentalRequestDecisionInput,
  ) {
    return this.decisions.approve(actor, id, input);
  }

  @Post(':id/decisions/partially-approve')
  @RequirePermissions('rental_request.view', 'rental_request.partially_approve')
  partiallyApprove(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(partiallyApproveRentalRequestDecisionSchema))
    input: PartiallyApproveRentalRequestDecisionInput,
  ) {
    return this.decisions.partiallyApprove(actor, id, input);
  }

  @Post(':id/decisions/reject')
  @RequirePermissions('rental_request.view', 'rental_request.reject')
  reject(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(rejectRentalRequestDecisionSchema))
    input: RejectRentalRequestDecisionInput,
  ) {
    return this.decisions.reject(actor, id, input);
  }

  @Put(':id/assignment')
  @RequirePermissions('rental_request.view', 'rental_request.assign')
  assign(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateRentalRequestAssignmentSchema))
    input: UpdateRentalRequestAssignmentInput,
  ) {
    return this.requests.assign(actor, id, input);
  }

  @Delete(':id/assignment')
  @RequirePermissions('rental_request.view', 'rental_request.assign')
  unassign(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(unassignRentalRequestSchema))
    input: UnassignRentalRequestInput,
  ) {
    return this.requests.unassign(actor, id, input);
  }

  @Get(':id/notes')
  @RequirePermissions('rental_request.view')
  notes(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.requests.notes(id);
  }

  @Post(':id/notes')
  @RequirePermissions('rental_request.view', 'rental_request.update')
  addNote(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(createRentalRequestInternalNoteSchema))
    input: CreateRentalRequestInternalNoteInput,
  ) {
    return this.requests.addNote(actor, id, input);
  }

  @Put(':id/review-state')
  @RequirePermissions('rental_request.view', 'rental_request.update')
  startReview(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateRentalRequestReviewStateSchema))
    input: UpdateRentalRequestReviewStateInput,
  ) {
    return this.requests.startReview(actor, id, input);
  }

  @Get(':id/activity')
  @RequirePermissions('rental_request.view')
  activity(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.requests.activity(id);
  }
}
