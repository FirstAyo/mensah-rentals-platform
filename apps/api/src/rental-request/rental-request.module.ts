import { Module } from '@nestjs/common';

import { AdminRentalRequestController } from './admin-rental-request.controller';
import { AdminRentalRequestNoStoreInterceptor } from './admin-rental-request-no-store.interceptor';
import { AdminRentalRequestService } from './admin-rental-request.service';
import { PublicRentalRequestController } from './public-rental-request.controller';
import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';
import { PublicRentalRequestService } from './public-rental-request.service';
import { RentalRequestDecisionService } from './rental-request-decision.service';

@Module({
  controllers: [AdminRentalRequestController, PublicRentalRequestController],
  providers: [
    AdminRentalRequestNoStoreInterceptor,
    AdminRentalRequestService,
    RentalRequestDecisionService,
    PublicRentalRequestService,
    PublicRentalRequestRateLimitGuard,
  ],
})
export class RentalRequestModule {}
