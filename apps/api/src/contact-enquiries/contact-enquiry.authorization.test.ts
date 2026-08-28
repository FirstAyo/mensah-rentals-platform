import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { ContactEnquiryModule } from './contact-enquiry.module';
import { ContactEnquiryService } from './contact-enquiry.service';

const baseUser: StaffUserResponse = {
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

const valid = {
  email: 'customer@example.test',
  enquiryType: 'GENERAL',
  message: 'A sufficiently detailed contact enquiry for testing.',
  name: 'Customer Name',
  operationId: 'fa40e80b-b72c-4d4c-ad4f-4489bd6136a1',
  website: '',
};

describe('contact enquiry authorization and public safety', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const enquiries = {
    get: vi.fn(async () => ({
      id: 'contact-id',
      message: 'Safe',
      status: 'NEW',
    })),
    list: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    })),
    submit: vi.fn(async () => ({
      accepted: true,
      message: 'Received.',
      referenceNumber: 'ENQ-20260828-ABC12345',
    })),
    updateStatus: vi.fn(async () => ({
      id: 'contact-id',
      message: 'Safe',
      status: 'READ',
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
        ContactEnquiryModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(ContactEnquiryService)
      .useValue(enquiries)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('accepts a valid public submission without authentication and exposes no internals', async () => {
    const response = await request(app.getHttpServer())
      .post('/public/contact-enquiries')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3000')
      .send(valid)
      .expect(202);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(
      /inventory|staff|password|permission|operationId|payloadHash|session|capability/i,
    );
  });

  it('rejects invalid input and a foreign origin', async () => {
    await request(app.getHttpServer())
      .post('/public/contact-enquiries')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://evil.example')
      .send(valid)
      .expect(403);
    await request(app.getHttpServer())
      .post('/public/contact-enquiries')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3000')
      .send({ ...valid, message: 'short' })
      .expect(400);
  });

  it('returns 401 unauthenticated and 403 without the exact permissions', async () => {
    current = null;
    await request(app.getHttpServer())
      .get('/admin/contact-enquiries')
      .expect(401);
    current = baseUser;
    await request(app.getHttpServer())
      .get('/admin/contact-enquiries')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
  });

  it('separates view and manage permissions', async () => {
    current = { ...baseUser, permissionKeys: ['contact_enquiry.view'] };
    await request(app.getHttpServer())
      .get('/admin/contact-enquiries')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    await request(app.getHttpServer())
      .put('/admin/contact-enquiries/cm00000000000000000000000/status')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3001')
      .send({ operationId: valid.operationId, status: 'READ' })
      .expect(403);
    current = {
      ...baseUser,
      permissionKeys: ['contact_enquiry.manage', 'contact_enquiry.view'],
    };
    await request(app.getHttpServer())
      .put('/admin/contact-enquiries/cm00000000000000000000000/status')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3001')
      .send({ operationId: valid.operationId, status: 'READ' })
      .expect(200);
  });
});
