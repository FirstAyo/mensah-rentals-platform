import { Global, Module } from '@nestjs/common';

import {
  AdminFeatureSettingsController,
  PublicFeatureSettingsController,
} from './feature-settings.controller';
import { FeatureGuard } from './feature.guard';
import { FeatureOperationCoordinator } from './feature-operation-coordinator';
import { FeatureSettingsService } from './feature-settings.service';

@Global()
@Module({
  controllers: [
    AdminFeatureSettingsController,
    PublicFeatureSettingsController,
  ],
  exports: [FeatureGuard, FeatureOperationCoordinator, FeatureSettingsService],
  providers: [
    FeatureGuard,
    FeatureOperationCoordinator,
    FeatureSettingsService,
  ],
})
export class FeatureSettingsModule {}
