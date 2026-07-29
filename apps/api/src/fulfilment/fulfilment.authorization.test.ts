import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { FulfilmentModule } from './fulfilment.module';
import { FulfilmentService } from './fulfilment.service';

const id = 'cm00000000000000000000000';
const base: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'staff@example.test',
  firstName: 'Fulfilment',
  id: 'staff',
  lastLoginAt: null,
  lastName: 'Staff',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

describe('fulfilment HTTP authorization', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const service = {
    get: vi.fn(async () => ({ id })),
    start: vi.fn(async () => ({ id })),
    prepare: vi.fn(async () => ({ id })),
    markReady: vi.fn(async () => ({ id })),
    checkout: vi.fn(async () => ({ id })),
    listActive: vi.fn(async () => ({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    })),
    activeDetail: vi.fn(async () => ({ id })),
    pdf: vi.fn(async () => ({
      buffer: Buffer.from('%PDF-1.4'),
      filename: 'manifest.pdf',
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
              STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        FulfilmentModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(FulfilmentService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => app.close());
  const cookie = ['mensah_staff_session=x'];
  it('returns 401 unauthenticated and 403 without fulfilment.view', async () => {
    await request(app.getHttpServer())
      .get(`/admin/orders/${id}/fulfilment`)
      .expect(401);
    current = base;
    await request(app.getHttpServer())
      .get(`/admin/orders/${id}/fulfilment`)
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['fulfilment.view'] };
    await request(app.getHttpServer())
      .get(`/admin/orders/${id}/fulfilment`)
      .set('Cookie', cookie)
      .expect(200);
  });
  it('enforces prepare independently', async () => {
    current = { ...base, permissionKeys: ['fulfilment.view'] };
    await request(app.getHttpServer())
      .post(`/admin/orders/${id}/fulfilment/start-preparation`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send({
        operationId: '00000000-0000-4000-8000-000000000000',
        expectedReservationVersion: 0,
      })
      .expect(403);
    current = { ...base, permissionKeys: ['fulfilment.prepare'] };
    await request(app.getHttpServer())
      .post(`/admin/orders/${id}/fulfilment/start-preparation`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send({
        operationId: '00000000-0000-4000-8000-000000000000',
        expectedReservationVersion: 0,
      })
      .expect(201);
  });
  it('requires checkout and handoff together', async () => {
    const body = {
      operationId: '00000000-0000-4000-8000-000000000000',
      expectedVersion: 1,
      expectedReservationVersion: 1,
      allowPartial: false,
      handoffAt: '2026-07-30T12:00:00.000Z',
      recipientName: 'Customer',
      items: [
        { rentalOrderItemId: id, quantity: 1, serializedAllocationIds: [] },
      ],
    };
    current = { ...base, permissionKeys: ['fulfilment.checkout'] };
    await request(app.getHttpServer())
      .post(`/admin/orders/${id}/fulfilment/checkout`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(403);
    current = {
      ...base,
      permissionKeys: ['fulfilment.checkout', 'fulfilment.handoff'],
    };
    await request(app.getHttpServer())
      .post(`/admin/orders/${id}/fulfilment/checkout`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(201);
  });
  it('protects active rentals independently', async () => {
    current = base;
    await request(app.getHttpServer())
      .get('/admin/active-rentals')
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['active_rental.view'] };
    await request(app.getHttpServer())
      .get('/admin/active-rentals')
      .set('Cookie', cookie)
      .expect(200);
  });
});
