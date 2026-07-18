import { Module } from '@nestjs/common';

import { AuthorizationController } from './authorization.controller';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PermissionGuard } from './permission.guard';

@Module({
  controllers: [AuthorizationController],
  providers: [AuthorizationRepository, AuthorizationService, PermissionGuard],
  exports: [PermissionGuard],
})
export class AuthorizationModule {}
