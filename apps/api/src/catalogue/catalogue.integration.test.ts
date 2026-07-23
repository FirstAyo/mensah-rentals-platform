import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { CatalogueModule } from './catalogue.module';
import { CatalogueService } from './catalogue.service';
const user: StaffUserResponse = {
  createdAt: '2026-07-18T00:00:00.000Z',
  email: 'staff@example.test',
  firstName: 'Staff',
  id: 'staff-id',
  lastLoginAt: null,
  lastName: 'User',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: '2026-07-18T00:00:00.000Z',
};
describe('catalogue HTTP visibility and authorization', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const catalogue = {
    listPublicProducts: vi.fn(async () => ({
      items: [
        {
          name: 'Chair',
          slug: 'chair',
          shortDescription: 'Folding chair',
          rentalUnit: 'each',
          isFeatured: false,
          category: { name: 'Seating', slug: 'seating', description: null },
          images: [],
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    listAdminProducts: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    createProduct: vi.fn(async () => ({ id: 'product-id' })),
    createCategory: vi.fn(async () => ({ id: 'category-id' })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              AUTH_COOKIE_SECURE: false,
              AUTH_LOGIN_RATE_LIMIT: 100,
              AUTH_LOGIN_RATE_WINDOW_SECONDS: 60,
              STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
              STAFF_SESSION_TTL_HOURS: 12,
            }),
          ],
        }),
        AuthModule,
        CatalogueModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(CatalogueService)
      .useValue(catalogue)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => app.close());
  it('serves a public-safe product list without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/products')
      .expect(200);
    expect(response.body.items[0].name).toBe('Chair');
    expect(JSON.stringify(response.body)).not.toMatch(
      /totalQuantity|availableQuantity|reservedQuantity|passwordHash|tokenHash/i,
    );
  });
  it('returns 401 without a session and 403 without product.view', async () => {
    current = null;
    await request(app.getHttpServer()).get('/admin/products').expect(401);
    current = user;
    await request(app.getHttpServer())
      .get('/admin/products')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
  });
  it('allows product.view and independently protects product/category creation', async () => {
    current = { ...user, permissionKeys: ['product.view'] };
    await request(app.getHttpServer())
      .get('/admin/products')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    await request(app.getHttpServer())
      .post('/admin/products')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(403);
    current = {
      ...user,
      permissionKeys: ['product.create', 'category.create'],
    };
    const product = {
      categoryId: 'cm00000000000000000000000',
      name: 'Chair',
      slug: 'chair',
      shortDescription: 'Chair',
      rentalUnit: 'each',
      isFeatured: false,
      specifications: [],
      isActive: true,
    };
    await request(app.getHttpServer())
      .post('/admin/products')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .set('Content-Type', 'application/json')
      .send(product)
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .set('Content-Type', 'application/json')
      .send({ name: 'Seating', slug: 'seating', sortOrder: 0, isActive: true })
      .expect(201);
  });
});
