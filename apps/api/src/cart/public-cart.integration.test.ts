import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { CartModule } from './cart.module';
import { PublicCartService } from './public-cart.service';

describe('public cart HTTP boundary', () => {
  let app: INestApplication;
  const empty = { desiredUnitCount: 0, distinctItemCount: 0, items: [] };
  const service = {
    get: vi.fn(async () => ({ cart: empty })),
    setItem: vi.fn(async () => ({
      cart: empty,
      expiresAt: new Date('2026-08-22T00:00:00.000Z'),
      rawToken: 'a'.repeat(43),
    })),
    removeItem: vi.fn(async () => ({ cart: empty })),
    clear: vi.fn(async () => ({ cart: empty, clearToken: true })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              AUTH_LOGIN_RATE_LIMIT: 100,
              AUTH_LOGIN_RATE_WINDOW_SECONDS: 60,
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        CartModule,
      ],
    })
      .overrideProvider(PublicCartService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('allows an anonymous empty GET with private no-store caching', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/cart')
      .expect(200);
    expect(response.body).toEqual(empty);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('requires exact web Origin and JSON for public mutations', async () => {
    await request(app.getHttpServer())
      .put('/public/cart/items/folding-chair')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'application/json')
      .send({ desiredQuantity: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .put('/public/cart/items/folding-chair')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'text/plain')
      .send('{}')
      .expect(415);
  });

  it('validates input and returns the capability in headers only', async () => {
    await request(app.getHttpServer())
      .put('/public/cart/items/folding-chair')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send({ desiredQuantity: 0 })
      .expect(400);
    const response = await request(app.getHttpServer())
      .put('/public/cart/items/folding-chair')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send({ desiredQuantity: 100 })
      .expect(200);
    expect(response.headers['x-rental-cart-token']).toBe('a'.repeat(43));
    expect(JSON.stringify(response.body)).not.toMatch(/token|inventory|stock/i);
  });
});
