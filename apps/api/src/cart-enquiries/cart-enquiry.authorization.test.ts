import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { CartEnquiryModule } from './cart-enquiry.module';
import { CartEnquiryService } from './cart-enquiry.service';

const operationId = 'fa40e80b-b72c-4d4c-ad4f-4489bd6136a1';
const token = 'a'.repeat(43);
const valid = {
  additionalEquipment: 'Ten black pipe-and-drape panels',
  company: 'Customer Company',
  contactEmail: 'customer@example.test',
  contactPhone: '+1 604 555 0100',
  customerName: 'Customer Name',
  customerNotes: 'Please contact us before delivery.',
  fulfilmentMethod: 'DELIVERY',
  location: 'Richmond, BC',
  operationId,
  projectName: 'Customer Project',
  rentalEndDate: '2026-11-12',
  rentalStartDate: '2026-11-10',
  website: '',
};
const user: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'staff@example.test',
  firstName: 'Staff',
  id: 'staff-id',
  lastLoginAt: null,
  lastName: 'User',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

describe('cart enquiry authorization and public safety', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const service = {
    get: vi.fn(async () => ({ id: 'enquiry-id', status: 'NEW' })),
    list: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    retryDelivery: vi.fn(async () => ({ id: 'enquiry-id', status: 'NEW' })),
    submit: vi.fn(async () => ({
      accepted: true,
      message: 'Your rental enquiry has been received.',
      referenceNumber: 'MR-20260911-ABC12345',
    })),
    updateStatus: vi.fn(async () => ({ id: 'enquiry-id', status: 'READ' })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              CART_ENQUIRY_RECIPIENT_EMAIL: 'company@example.test',
              NODE_ENV: 'test',
              PUBLIC_CONTACT_GLOBAL_RATE_LIMIT: 100,
              PUBLIC_CONTACT_GLOBAL_RATE_WINDOW_SECONDS: 60,
              PUBLIC_CONTACT_RATE_LIMIT: 100,
              PUBLIC_CONTACT_RATE_WINDOW_SECONDS: 3600,
              STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
              STAFF_SESSION_TTL_HOURS: 12,
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        CartEnquiryModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(CartEnquiryService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('accepts a cart-scoped public request and exposes only a safe receipt', async () => {
    const response = await request(app.getHttpServer())
      .post('/public/cart/enquiries')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3000')
      .set('x-rental-cart-token', token)
      .send(valid)
      .expect(202);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(service.submit).toHaveBeenCalledWith(token, expect.any(Object));
    expect(JSON.stringify(response.body)).not.toMatch(
      /inventory|reservation|staff|password|permission|operationId|payloadHash|session|capability|recipient|outbound/i,
    );
  });

  it('rejects foreign origins and invalid bodies', async () => {
    await request(app.getHttpServer())
      .post('/public/cart/enquiries')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://evil.example')
      .set('x-rental-cart-token', token)
      .send(valid)
      .expect(403);
    await request(app.getHttpServer())
      .post('/public/cart/enquiries')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3000')
      .set('x-rental-cart-token', token)
      .send({ ...valid, rentalEndDate: '2026-01-01' })
      .expect(400);
  });

  it('returns 401 without authentication and 403 without view permission', async () => {
    current = null;
    await request(app.getHttpServer()).get('/admin/cart-enquiries').expect(401);
    current = user;
    await request(app.getHttpServer())
      .get('/admin/cart-enquiries')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
  });

  it('separates view from manage and retry permissions', async () => {
    current = { ...user, permissionKeys: ['cart_enquiry.view'] };
    await request(app.getHttpServer())
      .get('/admin/cart-enquiries')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    await request(app.getHttpServer())
      .put('/admin/cart-enquiries/cm00000000000000000000000/status')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3001')
      .send({ operationId, status: 'READ' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/admin/cart-enquiries/cm00000000000000000000000/email/retry')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3001')
      .send({ operationId })
      .expect(403);
    current = {
      ...user,
      permissionKeys: ['cart_enquiry.manage', 'cart_enquiry.view'],
    };
    await request(app.getHttpServer())
      .post('/admin/cart-enquiries/cm00000000000000000000000/email/retry')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3001')
      .send({ operationId })
      .expect(200);
  });
});
