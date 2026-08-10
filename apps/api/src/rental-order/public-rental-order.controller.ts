import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
  Post,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { orderCustomerAccessSchema } from '@mensah-rentals/validation';

import { Public } from '../auth/public.decorator';
import { RentalOrderNoStoreInterceptor } from './rental-order-no-store.interceptor';
import { RentalOrderService } from './rental-order.service';

const capabilityHeader = 'x-order-capability';

@Public()
@Controller('public/orders')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class PublicRentalOrderController {
  constructor(
    @Inject(RentalOrderService) private readonly orders: RentalOrderService,
  ) {}

  @Post('access')
  access(@Body() input: unknown) {
    const parsed = orderCustomerAccessSchema.safeParse(input);
    if (!parsed.success) throw new NotFoundException('Order is unavailable');
    return this.orders.validateCapability(parsed.data.capability);
  }

  @Get('current')
  current(@Headers(capabilityHeader) capability: string | undefined) {
    return this.orders.publicCurrent(capability ?? '');
  }

  @Post('current/view')
  view(@Headers(capabilityHeader) capability: string | undefined) {
    return this.orders.markViewed(capability ?? '');
  }

  @Get('current/pdf')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', 'sandbox')
  async pdf(@Headers(capabilityHeader) capability: string | undefined) {
    const pdf = await this.orders.publicPdf(capability ?? '');
    return new StreamableFile(pdf.buffer, {
      disposition: `attachment; filename="${pdf.filename}"`,
      type: 'application/pdf',
    });
  }

  @Get('current/return-pdf')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', 'sandbox')
  async returnPdf(@Headers(capabilityHeader) capability: string | undefined) {
    const pdf = await this.orders.publicReturnPdf(capability ?? '');
    return new StreamableFile(pdf.buffer, {
      disposition: `attachment; filename="${pdf.filename}"`,
      type: 'application/pdf',
    });
  }
}
