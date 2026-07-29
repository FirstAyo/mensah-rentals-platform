import {
  Body,
  Controller,
  Get,
  Header,
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
  activeRentalListQuerySchema,
  checkoutFulfilmentSchema,
  cuidParamSchema,
  markFulfilmentReadySchema,
  startPreparationSchema,
  updatePreparationSchema,
  type ActiveRentalListQuery,
  type CheckoutFulfilmentInput,
  type MarkFulfilmentReadyInput,
  type StartPreparationInput,
  type UpdatePreparationInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RentalOrderNoStoreInterceptor } from '../rental-order/rental-order-no-store.interceptor';
import { RentalOrderZodPipe } from '../rental-order/rental-order-zod.pipe';
import { FulfilmentService } from './fulfilment.service';

@Controller('admin/orders/:orderId/fulfilment')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminFulfilmentController {
  constructor(
    @Inject(FulfilmentService) private readonly fulfilment: FulfilmentService,
  ) {}
  @Get()
  @RequirePermissions('fulfilment.view')
  get(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
  ) {
    return this.fulfilment.get(actor.id, orderId);
  }
  @Post('start-preparation')
  @RequirePermissions('fulfilment.prepare')
  start(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Body(new RentalOrderZodPipe(startPreparationSchema))
    input: StartPreparationInput,
  ) {
    return this.fulfilment.start(actor.id, orderId, input);
  }
  @Put('preparation')
  @RequirePermissions('fulfilment.prepare')
  prepare(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Body(new RentalOrderZodPipe(updatePreparationSchema))
    input: UpdatePreparationInput,
  ) {
    return this.fulfilment.prepare(actor.id, orderId, input);
  }
  @Post('mark-ready')
  @RequirePermissions('fulfilment.prepare')
  ready(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Body(new RentalOrderZodPipe(markFulfilmentReadySchema))
    input: MarkFulfilmentReadyInput,
  ) {
    return this.fulfilment.markReady(actor.id, orderId, input);
  }
  @Post('checkout')
  @RequirePermissions('fulfilment.checkout', 'fulfilment.handoff')
  checkout(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Body(new RentalOrderZodPipe(checkoutFulfilmentSchema))
    input: CheckoutFulfilmentInput,
  ) {
    return this.fulfilment.checkout(actor.id, orderId, input);
  }

  @Get(':kind')
  @RequirePermissions('fulfilment.view', 'fulfilment.pdf')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', 'sandbox')
  async pdf(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Param('kind') kind: string,
  ) {
    if (
      kind !== 'picking-pdf' &&
      kind !== 'handoff-pdf' &&
      kind !== 'active-rental-pdf'
    ) {
      throw new NotFoundException('Fulfilment document not found');
    }
    const result = await this.fulfilment.pdf(
      actor.id,
      orderId,
      kind === 'picking-pdf'
        ? 'picking'
        : kind === 'handoff-pdf'
          ? 'handoff'
          : 'active-rental',
    );
    return new StreamableFile(result.buffer, {
      disposition: `attachment; filename="${result.filename}"`,
      type: 'application/pdf',
    });
  }
}

@Controller('admin/active-rentals')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminActiveRentalController {
  constructor(
    @Inject(FulfilmentService) private readonly fulfilment: FulfilmentService,
  ) {}
  @Get()
  @RequirePermissions('active_rental.view')
  list(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new RentalOrderZodPipe(activeRentalListQuerySchema))
    query: ActiveRentalListQuery,
  ) {
    return this.fulfilment.listActive(actor.id, query);
  }
  @Get(':id')
  @RequirePermissions('active_rental.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ) {
    return this.fulfilment.activeDetail(actor.id, id);
  }
}
