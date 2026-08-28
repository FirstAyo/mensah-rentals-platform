import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FeatureOperationCoordinator } from './feature-operation-coordinator';
import { FeatureSettingsService } from './feature-settings.service';
import {
  REQUIRED_FEATURE,
  type RequiredFeatureMetadata,
} from './requires-feature.decorator';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(FeatureSettingsService)
    private readonly features: FeatureSettingsService,
    @Inject(FeatureOperationCoordinator)
    private readonly coordinator: FeatureOperationCoordinator,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<RequiredFeatureMetadata>(
      REQUIRED_FEATURE,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;
    const release = await this.coordinator.acquireRead();
    try {
      await this.features.assertAvailable(required.key, required.audience);
      const response = context.switchToHttp().getResponse<{
        once?: (event: string, listener: () => void) => void;
      }>();
      if (!response?.once) {
        release();
      } else {
        response.once('finish', release);
        response.once('close', release);
      }
      return true;
    } catch (error) {
      release();
      throw error;
    }
  }
}
