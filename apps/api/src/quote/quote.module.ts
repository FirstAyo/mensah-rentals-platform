import { Module } from '@nestjs/common';

import {
  AdminQuoteController,
  AdminRequestQuoteController,
} from './admin-quote.controller';
import { PublicQuoteController } from './public-quote.controller';
import { QuoteNoStoreInterceptor } from './quote-no-store.interceptor';
import { QuoteService } from './quote.service';

@Module({
  controllers: [
    AdminQuoteController,
    AdminRequestQuoteController,
    PublicQuoteController,
  ],
  providers: [QuoteNoStoreInterceptor, QuoteService],
})
export class QuoteModule {}
