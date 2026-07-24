import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Put,
  Res,
} from '@nestjs/common';
import {
  catalogueSlugSchema,
  setCartItemSchema,
  type SetCartItemInput,
} from '@mensah-rentals/validation';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import {
  type CartOperationResult,
  PublicCartService,
} from './public-cart.service';

const TOKEN_HEADER = 'x-rental-cart-token';

@Public()
@Controller('public/cart')
export class PublicCartController {
  constructor(
    @Inject(PublicCartService) private readonly cart: PublicCartService,
  ) {}

  @Get()
  async get(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(response, await this.cart.get(token));
  }

  @Put('items/:productSlug')
  async setItem(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Param('productSlug', new ZodBodyPipe(catalogueSlugSchema))
    productSlug: string,
    @Body(new ZodBodyPipe(setCartItemSchema)) input: SetCartItemInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.cart.setItem(token, productSlug, input),
    );
  }

  @Delete('items/:productSlug')
  async removeItem(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Param('productSlug', new ZodBodyPipe(catalogueSlugSchema))
    productSlug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      response,
      await this.cart.removeItem(token, productSlug),
    );
  }

  @HttpCode(200)
  @Delete()
  async clear(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(response, await this.cart.clear(token));
  }

  private respond(response: Response, result: CartOperationResult) {
    response.setHeader('Cache-Control', 'private, no-store');
    if (result.rawToken) response.setHeader(TOKEN_HEADER, result.rawToken);
    if (result.expiresAt)
      response.setHeader(
        'x-rental-cart-expires-at',
        result.expiresAt.toISOString(),
      );
    if (result.clearToken) response.setHeader('x-rental-cart-clear', 'true');
    return result.cart;
  }
}
