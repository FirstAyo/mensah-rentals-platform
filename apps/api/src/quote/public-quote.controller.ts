import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import {
  quoteCustomerAccessSchema,
  quoteCustomerResponseSchema,
  type QuoteCustomerAccessInput,
  type QuoteCustomerResponseInput,
} from '@mensah-rentals/validation';

import { Public } from '../auth/public.decorator';
import { QuoteNoStoreInterceptor } from './quote-no-store.interceptor';
import { QuoteService } from './quote.service';
import { QuoteZodPipe } from './quote-zod.pipe';

const capabilityHeader = 'x-quote-capability';

@Public()
@Controller('public/quotes')
@UseInterceptors(QuoteNoStoreInterceptor)
export class PublicQuoteController {
  constructor(@Inject(QuoteService) private readonly quotes: QuoteService) {}

  @Post('access')
  access(
    @Body(new QuoteZodPipe(quoteCustomerAccessSchema))
    input: QuoteCustomerAccessInput,
  ) {
    return this.quotes.validateCapability(input.capability);
  }

  @Get('current')
  current(@Headers(capabilityHeader) capability: string | undefined) {
    return this.quotes.publicCurrent(capability ?? '');
  }

  @Post('current/view')
  view(@Headers(capabilityHeader) capability: string | undefined) {
    return this.quotes.markViewed(capability ?? '');
  }

  @Post('current/respond')
  respond(
    @Headers(capabilityHeader) capability: string | undefined,
    @Body(new QuoteZodPipe(quoteCustomerResponseSchema))
    input: QuoteCustomerResponseInput,
  ) {
    return this.quotes.respond(capability ?? '', input);
  }
}
