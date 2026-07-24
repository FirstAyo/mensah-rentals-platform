import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSessionToken, hashSessionToken } from '@mensah-rentals/auth';
import { prisma, type Prisma } from '@mensah-rentals/database';
import type { PublicCartResponse } from '@mensah-rentals/types';
import type {
  ApiEnvironment,
  SetCartItemInput,
} from '@mensah-rentals/validation';

const MAX_CART_LINES = 50;

const cartSelect = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { productId: 'asc' as const }],
    select: {
      desiredQuantity: true,
      product: {
        select: {
          category: { select: { isActive: true, name: true, slug: true } },
          images: {
            orderBy: [
              { isPrimary: 'desc' as const },
              { sortOrder: 'asc' as const },
              { id: 'asc' as const },
            ],
            select: { altText: true, isPrimary: true, url: true },
            take: 1,
          },
          isActive: true,
          name: true,
          rentalUnit: true,
          shortDescription: true,
          slug: true,
        },
      },
    },
  },
} satisfies Prisma.CartSelect;

type SelectedCart = Prisma.CartGetPayload<{ select: typeof cartSelect }>;
type CartClient = typeof prisma | Prisma.TransactionClient;

export interface CartOperationResult {
  cart: PublicCartResponse;
  clearToken?: boolean;
  expiresAt?: Date;
  rawToken?: string;
}

@Injectable()
export class PublicCartService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  async get(rawToken?: string): Promise<CartOperationResult> {
    if (!rawToken) return { cart: this.empty() };
    const id = await this.findActiveCartId(prisma, rawToken, false);
    if (!id) return { cart: this.empty(), clearToken: true };
    return { cart: this.map(await this.fetch(prisma, id)) };
  }

  async setItem(
    rawToken: string | undefined,
    productSlug: string,
    input: SetCartItemInput,
  ): Promise<CartOperationResult> {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          slug: productSlug,
          isActive: true,
          category: { isActive: true },
        },
        select: { id: true },
      });
      if (!product)
        throw new NotFoundException('Product is not listed in the catalogue');

      let token = rawToken;
      let cartId = token ? await this.findActiveCartId(tx, token, true) : null;
      if (!cartId) {
        const createdToken = createSessionToken();
        token = createdToken.rawToken;
        const created = await tx.cart.create({
          data: {
            tokenHash: createdToken.tokenHash,
            expiresAt: this.expiry(),
          },
          select: { id: true },
        });
        cartId = created.id;
      }

      const existing = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId, productId: product.id } },
        select: { productId: true },
      });
      if (!existing) {
        const count = await tx.cartItem.count({ where: { cartId } });
        if (count >= MAX_CART_LINES)
          throw new UnprocessableEntityException(
            `A rental cart can contain at most ${MAX_CART_LINES} equipment types`,
          );
      }

      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId, productId: product.id } },
        create: {
          cartId,
          productId: product.id,
          desiredQuantity: input.desiredQuantity,
        },
        update: { desiredQuantity: input.desiredQuantity },
      });
      const expiresAt = this.expiry();
      await tx.cart.update({
        where: { id: cartId },
        data: { expiresAt, updatedAt: new Date() },
      });
      return {
        cart: this.map(await this.fetch(tx, cartId)),
        expiresAt,
        rawToken: token,
      };
    });
  }

  async removeItem(
    rawToken: string | undefined,
    productSlug: string,
  ): Promise<CartOperationResult> {
    if (!rawToken) return { cart: this.empty() };
    return prisma.$transaction(async (tx) => {
      const cartId = await this.findActiveCartId(tx, rawToken, true);
      if (!cartId) return { cart: this.empty(), clearToken: true };
      await tx.cartItem.deleteMany({
        where: { cartId, product: { slug: productSlug } },
      });
      const expiresAt = this.expiry();
      await tx.cart.update({
        where: { id: cartId },
        data: { expiresAt, updatedAt: new Date() },
      });
      return {
        cart: this.map(await this.fetch(tx, cartId)),
        expiresAt,
        rawToken,
      };
    });
  }

  async clear(rawToken?: string): Promise<CartOperationResult> {
    if (rawToken) {
      const tokenHash = hashSessionToken(rawToken);
      await prisma.cart.deleteMany({ where: { tokenHash } });
    }
    return { cart: this.empty(), clearToken: true };
  }

  private async findActiveCartId(
    client: CartClient,
    rawToken: string,
    lock: boolean,
  ): Promise<string | null> {
    const tokenHash = hashSessionToken(rawToken);
    if (lock) {
      const rows = await client.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Cart"
        WHERE "tokenHash" = ${tokenHash} AND "expiresAt" > CURRENT_TIMESTAMP
        FOR UPDATE
      `;
      return rows[0]?.id ?? null;
    }
    const cart = await client.cart.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return cart?.id ?? null;
  }

  private fetch(client: CartClient, id: string): Promise<SelectedCart> {
    return client.cart.findUniqueOrThrow({ where: { id }, select: cartSelect });
  }

  private map(cart: SelectedCart): PublicCartResponse {
    const items = cart.items.map(({ desiredQuantity, product }) => {
      const candidate = product.images[0];
      const image = candidate?.url.startsWith('/media/products/')
        ? candidate
        : null;
      return {
        desiredQuantity,
        product: {
          category: {
            name: product.category.name,
            slug: product.category.slug,
          },
          image: image
            ? {
                altText: image.altText,
                isPrimary: image.isPrimary,
                url: image.url,
              }
            : null,
          name: product.name,
          rentalUnit: product.rentalUnit,
          requestable: product.isActive && product.category.isActive,
          shortDescription: product.shortDescription,
          slug: product.slug,
        },
      };
    });
    return {
      desiredUnitCount: items.reduce(
        (total, item) => total + item.desiredQuantity,
        0,
      ),
      distinctItemCount: items.length,
      items,
    };
  }

  private empty(): PublicCartResponse {
    return { desiredUnitCount: 0, distinctItemCount: 0, items: [] };
  }

  private expiry(): Date {
    const days = this.config.get('PUBLIC_CART_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
