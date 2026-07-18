import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { ApiEnvironment } from '@mensah-rentals/validation';

import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { OriginGuard } from './origin.guard';
import { PasswordService } from './password.service';
import { StaffAuthGuard } from './staff-auth.guard';
import { StaffSessionCookieService } from './staff-session-cookie.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PermissionGuard } from '../authorization/permission.guard';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) => [
        {
          limit: config.get('AUTH_LOGIN_RATE_LIMIT', { infer: true }),
          ttl:
            config.get('AUTH_LOGIN_RATE_WINDOW_SECONDS', { infer: true }) *
            1000,
        },
      ],
    }),
    AuthorizationModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    PasswordService,
    StaffSessionCookieService,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: StaffAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService, StaffSessionCookieService],
})
export class AuthModule {}
