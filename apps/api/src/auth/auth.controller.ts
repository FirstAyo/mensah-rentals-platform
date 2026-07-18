import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type {
  StaffAuthResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import {
  staffLoginSchema,
  type StaffLoginInput,
} from '@mensah-rentals/validation';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { CurrentStaffUser } from './current-staff-user.decorator';
import { Public } from './public.decorator';
import { StaffSessionCookieService } from './staff-session-cookie.service';
import { ZodBodyPipe } from './zod-body.pipe';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(StaffSessionCookieService)
    private readonly cookieService: StaffSessionCookieService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodBodyPipe(staffLoginSchema)) input: StaffLoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StaffAuthResponse> {
    const result = await this.authService.login(input);
    this.cookieService.set(response, result.rawToken, result.expiresAt);
    return this.authService.toResponse(result.user);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.cookieService.read(request));
    this.cookieService.clear(response);
  }

  @Get('me')
  getCurrentUser(
    @CurrentStaffUser() user: StaffUserResponse,
  ): StaffAuthResponse {
    return this.authService.toResponse(user);
  }
}
