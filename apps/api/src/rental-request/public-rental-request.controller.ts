import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { PublicRentalRequestResponse } from '@mensah-rentals/types';
import {
  submitRentalRequestSchema,
  type SubmitRentalRequestInput,
} from '@mensah-rentals/validation';
import type { Response } from 'express';

import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';
import {
  type RentalRequestOperationResult,
  PublicRentalRequestService,
} from './public-rental-request.service';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';

const CART_TOKEN_HEADER = 'x-rental-cart-token';
const REQUEST_TOKEN_HEADER = 'x-rental-request-token';

@Public()
@UseGuards(PublicRentalRequestRateLimitGuard)
@Controller('public/rental-requests')
export class PublicRentalRequestController {
  constructor(
    @Inject(PublicRentalRequestService)
    private readonly requests: PublicRentalRequestService,
  ) {}

  @Post()
  async submit(
    @Headers(CART_TOKEN_HEADER) cartToken: string | undefined,
    @Headers(REQUEST_TOKEN_HEADER) requestToken: string | undefined,
    @Body(new ZodBodyPipe(submitRentalRequestSchema))
    input: SubmitRentalRequestInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicRentalRequestResponse> {
    return this.respond(
      response,
      await this.requests.submit(cartToken, requestToken, input),
      true,
    );
  }

  @Get(':referenceNumber')
  async track(
    @Headers(REQUEST_TOKEN_HEADER) requestToken: string | undefined,
    @Param('referenceNumber') referenceNumber: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicRentalRequestResponse> {
    return this.respond(
      response,
      await this.requests.track(requestToken, referenceNumber),
      false,
    );
  }

  private respond(
    response: Response,
    result: RentalRequestOperationResult,
    clearCart: boolean,
  ): PublicRentalRequestResponse {
    response.setHeader('Cache-Control', 'private, no-store');
    if (result.rawRequestToken)
      response.setHeader(REQUEST_TOKEN_HEADER, result.rawRequestToken);
    if (result.expiresAt)
      response.setHeader(
        'x-rental-request-expires-at',
        result.expiresAt.toISOString(),
      );
    if (clearCart) response.setHeader('x-rental-cart-clear', 'true');
    return result.request;
  }
}
