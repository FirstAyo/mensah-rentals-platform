import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  createRentalOrderSchema,
  cuidParamSchema,
  orderAccessOperationSchema,
  rentalOrderListQuerySchema,
  type CreateRentalOrderInput,
  type OrderAccessOperationInput,
  type RentalOrderListQuery,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RentalOrderNoStoreInterceptor } from './rental-order-no-store.interceptor';
import { RentalOrderService } from './rental-order.service';
import { RentalOrderZodPipe } from './rental-order-zod.pipe';

@Controller('admin/orders')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminRentalOrderController {
  constructor(
    @Inject(RentalOrderService) private readonly orders: RentalOrderService,
  ) {}

  @Get()
  @RequirePermissions('order.view')
  list(
    @Query(new RentalOrderZodPipe(rentalOrderListQuerySchema))
    query: RentalOrderListQuery,
  ) {
    return this.orders.list(query);
  }

  @Get(':id')
  @RequirePermissions('order.view')
  detail(@Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string) {
    return this.orders.detail(id);
  }

  @Get(':id/pdf')
  @RequirePermissions('order.view')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', 'sandbox')
  async pdf(@Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string) {
    const pdf = await this.orders.staffPdf(id);
    return new StreamableFile(pdf.buffer, {
      disposition: `attachment; filename="${pdf.filename}"`,
      type: 'application/pdf',
    });
  }

  @Post(':id/customer-access')
  @RequirePermissions('order.view', 'order.update')
  generateAccess(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(orderAccessOperationSchema))
    input: OrderAccessOperationInput,
  ) {
    return this.orders.generateCustomerAccess(actor, id, input);
  }

  @Post(':id/customer-access/revoke')
  @RequirePermissions('order.view', 'order.update')
  revokeAccess(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(orderAccessOperationSchema))
    input: OrderAccessOperationInput,
  ) {
    return this.orders.revokeCustomerAccess(actor, id, input);
  }

  @Post(':id/customer-access/rotate')
  @RequirePermissions('order.view', 'order.update')
  rotateAccess(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(orderAccessOperationSchema))
    input: OrderAccessOperationInput,
  ) {
    return this.orders.rotateCustomerAccess(actor, id, input);
  }

  @Post(':id/customer-access/resend')
  @RequirePermissions('order.view', 'order.update')
  resendAccess(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(orderAccessOperationSchema))
    input: OrderAccessOperationInput,
  ) {
    return this.orders.resendCustomerAccess(actor, id, input);
  }
}

@Controller('admin/quotes')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminQuoteOrderController {
  constructor(
    @Inject(RentalOrderService) private readonly orders: RentalOrderService,
  ) {}

  @Post(':quoteId/revisions/:revisionId/order')
  @RequirePermissions('order.create')
  create(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('quoteId', new RentalOrderZodPipe(cuidParamSchema)) quoteId: string,
    @Param('revisionId', new RentalOrderZodPipe(cuidParamSchema))
    revisionId: string,
    @Body(new RentalOrderZodPipe(createRentalOrderSchema))
    input: CreateRentalOrderInput,
  ) {
    return this.orders.create(actor, quoteId, revisionId, input);
  }
}
