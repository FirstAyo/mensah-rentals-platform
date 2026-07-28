import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  cuidParamSchema,
  quoteAccessOperationSchema,
  quoteListQuerySchema,
  quoteRevisionInputSchema,
  sendQuoteRevisionSchema,
  type QuoteAccessOperationInput,
  type QuoteListQuery,
  type QuoteRevisionInput,
  type SendQuoteRevisionInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { QuoteNoStoreInterceptor } from './quote-no-store.interceptor';
import { QuoteService } from './quote.service';
import { QuoteZodPipe } from './quote-zod.pipe';

@Controller('admin/quotes')
@UseInterceptors(QuoteNoStoreInterceptor)
export class AdminQuoteController {
  constructor(@Inject(QuoteService) private readonly quotes: QuoteService) {}

  @Get()
  @RequirePermissions('quote.view')
  list(@Query(new QuoteZodPipe(quoteListQuerySchema)) query: QuoteListQuery) {
    return this.quotes.list(query);
  }

  @Get(':id')
  @RequirePermissions('quote.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
  ) {
    return this.quotes.detail(id, actor.permissionKeys.includes('order.view'));
  }

  @Get(':id/revisions')
  @RequirePermissions('quote.view')
  async revisions(@Param('id', new QuoteZodPipe(cuidParamSchema)) id: string) {
    return (await this.quotes.detail(id, false)).revisions;
  }

  @Get(':id/revisions/:revisionId')
  @RequirePermissions('quote.view')
  async revision(
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new QuoteZodPipe(cuidParamSchema)) revisionId: string,
  ) {
    const quote = await this.quotes.detail(id, false);
    const revision = quote.revisions.find(
      (candidate) => candidate.id === revisionId,
    );
    if (!revision) throw new NotFoundException('Quote revision not found');
    return revision;
  }

  @Post(':id/revisions')
  @RequirePermissions('quote.view', 'quote.update')
  createRevision(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Body(new QuoteZodPipe(quoteRevisionInputSchema)) input: QuoteRevisionInput,
  ) {
    return this.quotes.createRevision(actor, id, input);
  }

  @Put(':id/revisions/:revisionId')
  @RequirePermissions('quote.view', 'quote.update')
  updateDraft(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new QuoteZodPipe(cuidParamSchema)) revisionId: string,
    @Body(new QuoteZodPipe(quoteRevisionInputSchema)) input: QuoteRevisionInput,
  ) {
    return this.quotes.updateDraft(actor, id, revisionId, input);
  }

  @Post(':id/revisions/:revisionId/send')
  @RequirePermissions('quote.view', 'quote.send')
  send(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new QuoteZodPipe(cuidParamSchema)) revisionId: string,
    @Body(new QuoteZodPipe(sendQuoteRevisionSchema))
    input: SendQuoteRevisionInput,
  ) {
    return this.quotes.send(actor, id, revisionId, input);
  }

  @Post(':id/revisions/:revisionId/resend')
  @RequirePermissions('quote.view', 'quote.send')
  resend(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new QuoteZodPipe(cuidParamSchema)) revisionId: string,
    @Body(new QuoteZodPipe(quoteAccessOperationSchema))
    input: QuoteAccessOperationInput,
  ) {
    return this.quotes.resend(actor, id, revisionId, input);
  }

  @Post(':id/revisions/:revisionId/access/rotate')
  @RequirePermissions('quote.view', 'quote.send')
  rotateAccess(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new QuoteZodPipe(cuidParamSchema)) revisionId: string,
    @Body(new QuoteZodPipe(quoteAccessOperationSchema))
    input: QuoteAccessOperationInput,
  ) {
    return this.quotes.rotateAccess(actor, id, revisionId, input);
  }

  @Get(':id/revisions/:revisionId/pdf')
  @RequirePermissions('quote.view')
  async pdf(
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new QuoteZodPipe(cuidParamSchema)) revisionId: string,
  ) {
    const pdf = await this.quotes.staffPdf(id, revisionId);
    return new StreamableFile(pdf.buffer, {
      disposition: `attachment; filename="${pdf.filename}"`,
      type: 'application/pdf',
    });
  }
}

@Controller('admin/rental-requests')
@UseInterceptors(QuoteNoStoreInterceptor)
export class AdminRequestQuoteController {
  constructor(@Inject(QuoteService) private readonly quotes: QuoteService) {}

  @Post(':id/quotes')
  @RequirePermissions('rental_request.view', 'quote.create')
  create(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new QuoteZodPipe(cuidParamSchema)) id: string,
    @Body(new QuoteZodPipe(quoteRevisionInputSchema)) input: QuoteRevisionInput,
  ) {
    return this.quotes.createFirst(actor, id, input);
  }
}
