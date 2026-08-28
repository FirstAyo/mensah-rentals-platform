import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Res,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type {
  PublicRentalRequestResponse,
  PublicRentalRequestRevisionResponse,
} from '@mensah-rentals/types';
import {
  cuidParamSchema,
  submitRentalRequestAmendmentSchema,
  submitRentalRequestSchema,
  type SubmitRentalRequestAmendmentInput,
  type SubmitRentalRequestInput,
} from '@mensah-rentals/validation';
import type { Response } from 'express';

import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';
import { AdminRentalRequestNoStoreInterceptor } from './admin-rental-request-no-store.interceptor';
import {
  type RentalRequestOperationResult,
  PublicRentalRequestService,
} from './public-rental-request.service';
import { Public } from '../auth/public.decorator';
import { RequireFeature } from '../feature-settings/requires-feature.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';

const CART_TOKEN_HEADER = 'x-rental-cart-token';
const REQUEST_TOKEN_HEADER = 'x-rental-request-token';

@Public()
@UseGuards(PublicRentalRequestRateLimitGuard)
@UseInterceptors(AdminRentalRequestNoStoreInterceptor)
@Controller('public/rental-requests')
@RequireFeature('RENTAL_REQUESTS', 'PUBLIC')
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

  @Get('current/revision')
  currentRevision(
    @Headers(REQUEST_TOKEN_HEADER) requestToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicRentalRequestRevisionResponse> {
    response.setHeader('Cache-Control', 'private, no-store');
    return this.requests.currentRevision(requestToken);
  }

  @Get('current/catalogue')
  catalogue(
    @Headers(REQUEST_TOKEN_HEADER) requestToken: string | undefined,
    @Query('search') search?: string,
  ) {
    return this.requests.catalogue(requestToken, search);
  }

  @Get('current/amendments')
  amendments(@Headers(REQUEST_TOKEN_HEADER) requestToken: string | undefined) {
    return this.requests.amendments(requestToken);
  }

  @Get('current/amendments/:amendmentId')
  amendment(
    @Headers(REQUEST_TOKEN_HEADER) requestToken: string | undefined,
    @Param('amendmentId', new ZodBodyPipe(cuidParamSchema)) amendmentId: string,
  ) {
    return this.requests.amendment(requestToken, amendmentId);
  }

  @Post('current/amendments')
  submitAmendment(
    @Headers(REQUEST_TOKEN_HEADER) requestToken: string | undefined,
    @Body(new ZodBodyPipe(submitRentalRequestAmendmentSchema))
    input: SubmitRentalRequestAmendmentInput,
  ) {
    return this.requests.submitAmendment(requestToken, input);
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
