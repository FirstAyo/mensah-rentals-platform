import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSessionToken, hashSessionToken } from '@mensah-rentals/auth';
import type { StaffAuthResponse } from '@mensah-rentals/types';
import type {
  ApiEnvironment,
  StaffLoginInput,
} from '@mensah-rentals/validation';

import { AuthRepository } from './auth.repository';
import type { LoginResult, ValidStaffSession } from './auth.types';
import { PasswordService } from './password.service';

const INVALID_CREDENTIALS_RESPONSE = {
  error: 'Unauthorized',
  message: 'Invalid email or password',
  statusCode: 401,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(AuthRepository)
    private readonly repository: AuthRepository,
    @Inject(PasswordService)
    private readonly passwordService: PasswordService,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async login(input: StaffLoginInput): Promise<LoginResult> {
    const credential = await this.repository.findUserForLogin(input.email);
    const passwordMatches = await this.passwordService.verify(
      credential?.passwordHash ?? null,
      input.password,
    );

    if (!credential || !passwordMatches || credential.status !== 'ACTIVE') {
      this.logger.warn('staff_login_rejected');
      throw new UnauthorizedException(INVALID_CREDENTIALS_RESPONSE);
    }

    const now = new Date();
    const ttlHours = this.config.get('STAFF_SESSION_TTL_HOURS', {
      infer: true,
    });
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const sessionToken = createSessionToken();
    const session = await this.repository.createSessionAndUpdateLogin({
      expiresAt,
      loggedInAt: now,
      tokenHash: sessionToken.tokenHash,
      userId: credential.id,
    });
    if (!session) {
      this.logger.warn('staff_login_rejected');
      throw new UnauthorizedException(INVALID_CREDENTIALS_RESPONSE);
    }

    this.logger.log(`staff_login_succeeded userId=${credential.id}`);
    return {
      expiresAt,
      rawToken: sessionToken.rawToken,
      user: session.user,
    };
  }

  async validateSession(
    rawToken: string | undefined,
  ): Promise<ValidStaffSession | null> {
    if (!rawToken) {
      return null;
    }

    return this.repository.findValidSession(
      hashSessionToken(rawToken),
      new Date(),
    );
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) {
      await this.repository.deleteSession(hashSessionToken(rawToken));
    }

    this.logger.log('staff_logout_completed');
  }

  toResponse(user: LoginResult['user']): StaffAuthResponse {
    return { user };
  }
}
