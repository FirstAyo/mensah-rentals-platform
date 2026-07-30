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
import { ProductMediaService } from '../media/product-media.service';
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
    deleteCategory: vi.fn(async () => ({
      categoryDeleted: true,
      hardDeletedProductCount: 0,
      productsRemovedFromCatalogue: 0,
      tombstonedProductCount: 0,
    })),
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
              MEDIA_STORAGE_ROOT: 'storage/test-media',
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
      .overrideProvider(ProductMediaService)
      .useValue({ removeCommittedFiles: vi.fn() })
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
  it('rejects administrative and malformed filters on public routes', async () => {
    await request(app.getHttpServer())
      .get('/public/products?isActive=false')
      .expect(400);
    await request(app.getHttpServer())
      .get('/public/products?categoryId=cm00000000000000000000000')
      .expect(400);
    await request(app.getHttpServer())
      .get('/public/products?sort=updatedAt')
      .expect(400);
    await request(app.getHttpServer())
      .get('/public/products?page=10001')
      .expect(400);
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

  it('protects permanent category deletion and validates confirmation safely', async () => {
    const id = 'cm00000000000000000000000';
    const sendDelete = () =>
      request(app.getHttpServer())
        .delete(`/admin/categories/${id}`)
        .set('Cookie', 'mensah_staff_session=x')
        .set('Origin', 'http://localhost:3001')
        .set('Content-Type', 'application/json');
    current = null;
    await sendDelete().send({ confirmDeleteProducts: false }).expect(401);
    current = { ...user, permissionKeys: ['category.update'] };
    await sendDelete().send({ confirmDeleteProducts: false }).expect(403);
    current = { ...user, permissionKeys: ['category.delete'] };
    await sendDelete()
      .send({ confirmDeleteProducts: 'yes' })
      .expect(422)
      .expect(({ body }) => {
        expect(body.message).toBe('Invalid category deletion request');
        expect(JSON.stringify(body)).not.toContain('Zod');
      });
    await sendDelete().send({ confirmDeleteProducts: true }).expect(200);
  });
});
