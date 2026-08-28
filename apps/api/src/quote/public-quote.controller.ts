import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  quoteCustomerAccessSchema,
  quoteCustomerResponseSchema,
  type QuoteCustomerResponseInput,
} from '@mensah-rentals/validation';

import { Public } from '../auth/public.decorator';
import { RequireFeature } from '../feature-settings/requires-feature.decorator';
import { QuoteNoStoreInterceptor } from './quote-no-store.interceptor';
import { QuoteService } from './quote.service';
import { QuoteZodPipe } from './quote-zod.pipe';

const capabilityHeader = 'x-quote-capability';

@Public()
@Controller('public/quotes')
@RequireFeature('CUSTOMER_ORDER_PORTAL', 'PUBLIC')
@UseInterceptors(QuoteNoStoreInterceptor)
export class PublicQuoteController {
  constructor(@Inject(QuoteService) private readonly quotes: QuoteService) {}

  @Post('access')
  access(@Body() input: unknown) {
    const parsed = quoteCustomerAccessSchema.safeParse(input);
    return this.quotes.validateCapability(
      parsed.success ? parsed.data.capability : '',
    );
  }

  @Get('current')
  current(@Headers(capabilityHeader) capability: string | undefined) {
    return this.quotes.publicCurrent(capability ?? '');
  }

  @Get('current/pdf')
  async pdf(@Headers(capabilityHeader) capability: string | undefined) {
    const pdf = await this.quotes.publicPdf(capability ?? '');
    return new StreamableFile(pdf.buffer, {
      disposition: `attachment; filename="${pdf.filename}"`,
      type: 'application/pdf',
    });
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
