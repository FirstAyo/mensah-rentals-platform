import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  featureChangePreviewSchema,
  featureChangeSchema,
  featurePresetApplySchema,
  featurePresetPreviewSchema,
  type FeatureChangeInput,
  type FeatureChangePreviewInput,
  type FeaturePresetApplyInput,
  type FeaturePresetPreviewInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { PrivateNoStoreInterceptor } from '../common/private-no-store.interceptor';
import { FeatureSettingsService } from './feature-settings.service';

@Controller('admin/feature-settings')
@UseInterceptors(PrivateNoStoreInterceptor)
export class AdminFeatureSettingsController {
  constructor(
    @Inject(FeatureSettingsService)
    private readonly features: FeatureSettingsService,
  ) {}

  @Get()
  @RequirePermissions('feature_settings.view')
  list() {
    return this.features.list();
  }

  @Get('availability')
  availability() {
    return this.features.adminAvailability();
  }

  @Post('preview')
  @RequirePermissions('feature_settings.manage')
  preview(
    @Body(new ZodBodyPipe(featureChangePreviewSchema))
    input: FeatureChangePreviewInput,
  ) {
    return this.features.preview(input);
  }

  @Post('presets/preview')
  @RequirePermissions('feature_settings.manage')
  previewPreset(
    @Body(new ZodBodyPipe(featurePresetPreviewSchema))
    input: FeaturePresetPreviewInput,
  ) {
    return this.features.previewPreset(input);
  }

  @Put()
  @RequirePermissions('feature_settings.manage')
  apply(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ZodBodyPipe(featureChangeSchema)) input: FeatureChangeInput,
  ) {
    return this.features.apply(actor.id, input);
  }

  @Post('presets')
  @RequirePermissions('feature_settings.manage')
  applyPreset(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ZodBodyPipe(featurePresetApplySchema))
    input: FeaturePresetApplyInput,
  ) {
    return this.features.applyPreset(actor.id, input);
  }
}

@Controller('public/features')
export class PublicFeatureSettingsController {
  constructor(
    @Inject(FeatureSettingsService)
    private readonly features: FeatureSettingsService,
  ) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'public, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  capabilities() {
    return this.features.publicCapabilities();
  }
}
