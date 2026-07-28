import { NotFoundException, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { RentalOrderModule } from './rental-order.module';
import { RentalOrderService } from './rental-order.service';
import { InventoryReservationService } from './inventory-reservation.service';

const id = 'cm00000000000000000000000';
const revisionId = 'cm00000000000000000000001';
const base: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'staff@example.test',
  firstName: 'Order',
  id: 'staff',
  lastLoginAt: null,
  lastName: 'Staff',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

describe('rental order HTTP authorization and validation', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const service = {
    create: vi.fn(async () => ({ order: { id, orderNumber: 'RO-TEST' } })),
    detail: vi.fn(async () => ({ id })),
    generateCustomerAccess: vi.fn(async () => ({
      access: { state: 'ACTIVE' },
    })),
    list: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    markViewed: vi.fn(),
    publicPdf: vi.fn(async () => {
      throw new NotFoundException('Order is unavailable');
    }),
    publicCurrent: vi.fn(),
    resendCustomerAccess: vi.fn(async () => ({ access: { state: 'ACTIVE' } })),
    revokeCustomerAccess: vi.fn(async () => ({ access: { state: 'REVOKED' } })),
    rotateCustomerAccess: vi.fn(async () => ({ access: { state: 'ACTIVE' } })),
    staffPdf: vi.fn(async () => ({
      buffer: Buffer.from('%PDF-1.4'),
      filename: 'order.pdf',
    })),
    validateCapability: vi.fn(async () => {
      throw new NotFoundException('Order is unavailable');
    }),
  };
  const reservationService = {
    availability: vi.fn(async () => ({ items: [], orderId: id })),
    complete: vi.fn(async () => ({ id: revisionId })),
    create: vi.fn(async () => ({ id: revisionId })),
    eligibleAssets: vi.fn(async () => ({ items: [] })),
    eligibleAssetsForOrder: vi.fn(async () => ({ items: [] })),
    get: vi.fn(async () => ({ id: revisionId })),
    release: vi.fn(async () => ({ id: revisionId })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        RentalOrderModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(RentalOrderService)
      .useValue(service)
      .overrideProvider(InventoryReservationService)
      .useValue(reservationService)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());
  const cookie = ['mensah_staff_session=x'];

  it('returns 401 unauthenticated, 403 without order.view, and succeeds when authorized', async () => {
    await request(app.getHttpServer()).get('/admin/orders').expect(401);
    current = base;
    await request(app.getHttpServer())
      .get('/admin/orders')
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['order.view'] };
    await request(app.getHttpServer())
      .get('/admin/orders')
      .set('Cookie', cookie)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    await request(app.getHttpServer())
      .get(`/admin/orders/${id}`)
      .set('Cookie', cookie)
      .expect(200);
  });

  it('requires order.create for the explicit conversion endpoint', async () => {
    const call = () =>
      request(app.getHttpServer())
        .post(`/admin/quotes/${id}/revisions/${revisionId}/order`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({ operationId: '00000000-0000-4000-8000-000000000000' });
    current = { ...base, permissionKeys: ['order.view'] };
    await call().expect(403);
    current = { ...base, permissionKeys: ['order.create'] };
    await call().expect(201);
  });

  it('requires order.view and order.update for customer-access mutations', async () => {
    const call = () =>
      request(app.getHttpServer())
        .post(`/admin/orders/${id}/customer-access`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({ operationId: '00000000-0000-4000-8000-000000000000' });
    current = { ...base, permissionKeys: ['order.view'] };
    await call().expect(403);
    current = { ...base, permissionKeys: ['order.update'] };
    await call().expect(403);
    current = { ...base, permissionKeys: ['order.view', 'order.update'] };
    await call().expect(201).expect('Cache-Control', 'private, no-store');
  });

  it('enforces each reservation permission independently', async () => {
    const get = (path: string) =>
      request(app.getHttpServer()).get(path).set('Cookie', cookie);
    current = { ...base, permissionKeys: ['order.view'] };
    await get(`/admin/orders/${id}/reservation`).expect(403);
    await get(`/admin/orders/${id}/availability`).expect(403);

    current = {
      ...base,
      permissionKeys: ['inventory.reservation.view'],
    };
    await get(`/admin/orders/${id}/reservation`).expect(200);
    await get(`/admin/orders/${id}/availability`).expect(403);

    current = {
      ...base,
      permissionKeys: ['inventory.availability.view'],
    };
    await get(`/admin/orders/${id}/availability`).expect(200);
    await get(
      `/admin/orders/${id}/eligible-assets?rentalOrderItemId=${revisionId}`,
    ).expect(200);

    const create = () =>
      request(app.getHttpServer())
        .post(`/admin/orders/${id}/reservations`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({
          allowPartial: false,
          operationId: '00000000-0000-4000-8000-000000000000',
          serializedSelections: [],
        });
    current = { ...base, permissionKeys: ['inventory.reservation.view'] };
    await create().expect(403);
    current = { ...base, permissionKeys: ['inventory.reservation.create'] };
    await create().expect(201);

    const complete = () =>
      request(app.getHttpServer())
        .post(`/admin/orders/${id}/reservations/${revisionId}/complete`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({
          allowPartial: false,
          expectedVersion: 1,
          operationId: '10000000-0000-4000-8000-000000000000',
          serializedSelections: [],
        });
    await complete().expect(403);
    current = { ...base, permissionKeys: ['inventory.reservation.update'] };
    await complete().expect(201);

    const release = () =>
      request(app.getHttpServer())
        .post(`/admin/orders/${id}/reservations/${revisionId}/release`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({
          expectedVersion: 1,
          operationId: '20000000-0000-4000-8000-000000000000',
          reason: 'Authorization test release.',
        });
    await release().expect(403);
    current = { ...base, permissionKeys: ['inventory.reservation.release'] };
    await release().expect(201);
  });

  it('protects staff PDFs and serves them as private PDF attachments', async () => {
    current = base;
    await request(app.getHttpServer())
      .get(`/admin/orders/${id}/pdf`)
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['order.view'] };
    await request(app.getHttpServer())
      .get(`/admin/orders/${id}/pdf`)
      .set('Cookie', cookie)
      .expect(200)
      .expect('Content-Type', /application\/pdf/)
      .expect('Cache-Control', 'private, no-store');
  });

  it('returns 422 for invalid paths, queries, and strict conversion payloads', async () => {
    current = { ...base, permissionKeys: ['order.view', 'order.create'] };
    await request(app.getHttpServer())
      .get('/admin/orders?page=0')
      .set('Cookie', cookie)
      .expect(422);
    await request(app.getHttpServer())
      .get('/admin/orders/not-a-cuid')
      .set('Cookie', cookie)
      .expect(422);
    await request(app.getHttpServer())
      .post(`/admin/quotes/${id}/revisions/${revisionId}/order`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send({ operationId: 'bad', totalCents: 1 })
      .expect(422);
  });

  it('returns one unavailable response for missing, malformed, and unknown capabilities', async () => {
    const missing = await request(app.getHttpServer())
      .post('/public/orders/access')
      .set('Origin', 'http://localhost:3000')
      .send({});
    const malformed = await request(app.getHttpServer())
      .post('/public/orders/access')
      .set('Origin', 'http://localhost:3000')
      .send({ capability: 'invalid' });
    const unknown = await request(app.getHttpServer())
      .post('/public/orders/access')
      .set('Origin', 'http://localhost:3000')
      .send({
        capability: `00000000-0000-4000-8000-000000000000.${'A'.repeat(43)}`,
      });
    for (const response of [missing, malformed, unknown]) {
      if (response.status !== 404)
        throw new Error(`Expected uniform 404, received ${response.status}`);
      if (response.body.message !== 'Order is unavailable')
        throw new Error('Customer access response was not uniform');
    }
  });
});
