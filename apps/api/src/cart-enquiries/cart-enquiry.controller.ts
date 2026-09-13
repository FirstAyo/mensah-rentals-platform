import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  cartEnquiryListQuerySchema,
  cuidParamSchema,
  retryOutboundEmailSchema,
  submitCartEnquirySchema,
  updateCartEnquiryStatusSchema,
  type CartEnquiryListQuery,
  type SubmitCartEnquiryInput,
  type UpdateCartEnquiryStatusInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CartEnquiryRateLimitGuard } from './cart-enquiry-rate-limit.guard';
import { CartEnquiryService } from './cart-enquiry.service';

const CART_TOKEN_HEADER = 'x-rental-cart-token';

@Controller('public/cart/enquiries')
export class PublicCartEnquiryController {
  constructor(
    @Inject(CartEnquiryService)
    private readonly enquiries: CartEnquiryService,
  ) {}

  @Public()
  @Post()
  @HttpCode(202)
  @UseGuards(CartEnquiryRateLimitGuard)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  submit(
    @Headers(CART_TOKEN_HEADER) cartToken: string | undefined,
    @Body(new ZodBodyPipe(submitCartEnquirySchema))
    input: SubmitCartEnquiryInput,
  ) {
    return this.enquiries.submit(cartToken, input);
  }
}

@Controller('admin/cart-enquiries')
export class AdminCartEnquiryController {
  constructor(
    @Inject(CartEnquiryService)
    private readonly enquiries: CartEnquiryService,
  ) {}

  @Get()
  @RequirePermissions('cart_enquiry.view')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Query(new ZodBodyPipe(cartEnquiryListQuerySchema))
    query: CartEnquiryListQuery,
  ) {
    return this.enquiries.list(query);
  }

  @Get(':id')
  @RequirePermissions('cart_enquiry.view')
  @Header('Cache-Control', 'private, no-store')
  get(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.enquiries.get(id);
  }

  @Put(':id/status')
  @RequirePermissions('cart_enquiry.manage')
  @Header('Cache-Control', 'private, no-store')
  updateStatus(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateCartEnquiryStatusSchema))
    input: UpdateCartEnquiryStatusInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.enquiries.updateStatus(id, user.id, input);
  }

  @Post(':id/email/retry')
  @HttpCode(200)
  @RequirePermissions('cart_enquiry.manage')
  @Header('Cache-Control', 'private, no-store')
  retry(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(retryOutboundEmailSchema))
    input: { operationId: string },
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.enquiries.retryDelivery(id, user.id, input.operationId);
  }
}
