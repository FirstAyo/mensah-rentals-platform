import { Module } from '@nestjs/common';

import { AdminRentalRequestController } from './admin-rental-request.controller';
import { AdminRentalRequestNoStoreInterceptor } from './admin-rental-request-no-store.interceptor';
import { AdminRentalRequestService } from './admin-rental-request.service';
import { PublicRentalRequestController } from './public-rental-request.controller';
import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';
import { PublicRentalRequestService } from './public-rental-request.service';
import { RentalRequestDecisionService } from './rental-request-decision.service';
import { RentalRequestRevisionService } from './rental-request-revision.service';
import {
  AdminRentalChangeRequestController,
  PublicRentalChangeRequestController,
} from './rental-change-request.controller';
import { RentalChangeRequestService } from './rental-change-request.service';

@Module({
  controllers: [
    AdminRentalRequestController,
    PublicRentalRequestController,
    AdminRentalChangeRequestController,
    PublicRentalChangeRequestController,
  ],
  providers: [
    AdminRentalRequestNoStoreInterceptor,
    AdminRentalRequestService,
    RentalRequestDecisionService,
    RentalRequestRevisionService,
    RentalChangeRequestService,
    PublicRentalRequestService,
    PublicRentalRequestRateLimitGuard,
  ],
})
export class RentalRequestModule {}
