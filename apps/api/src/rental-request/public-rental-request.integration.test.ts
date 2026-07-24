import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { RentalRequestModule } from './rental-request.module';
import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';
import { PublicRentalRequestService } from './public-rental-request.service';

const safeRequest = {
  fulfillmentMethod: 'PICKUP',
  items: [],
  projectName: 'Test event',
  referenceNumber: 'MR-2026-ABCDEFGH23',
  rentalEndDate: '2026-08-03',
  rentalStartDate: '2026-08-01',
  status: { key: 'REQUEST_SUBMITTED', label: 'Request submitted' },
  submittedAt: '2026-07-24T12:00:00.000Z',
};

describe('public rental request HTTP boundary', () => {
  let app: INestApplication;
  const capability = 'r'.repeat(43);
  const service = {
    submit: vi.fn(async () => ({
      request: safeRequest,
      rawRequestToken: capability,
      expiresAt: new Date('2027-01-20T00:00:00.000Z'),
    })),
    track: vi.fn(async () => ({ request: safeRequest })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        RentalRequestModule,
      ],
    })
      .overrideProvider(PublicRentalRequestService)
      .useValue(service)
      .overrideGuard(PublicRentalRequestRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('requires the exact public origin and JSON for submission', async () => {
    await request(app.getHttpServer())
      .post('/public/rental-requests')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/public/rental-requests')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'text/plain')
      .send('{}')
      .expect(415);
  });

  it('returns the request capability only in headers and marks the cart consumed', async () => {
    const response = await request(app.getHttpServer())
      .post('/public/rental-requests')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .set('x-rental-cart-token', 'c'.repeat(43))
      .send({
        submissionId: 'd62d2fd0-5574-4f75-af63-eec0eaf0e5d1',
        contactFirstName: 'Ama',
        contactLastName: 'Mensah',
        contactEmail: 'ama@example.test',
        contactPhone: '+233 20 123 4567',
        projectName: 'Test event',
        projectType: 'Event',
        projectLocation: 'Accra',
        fulfillmentMethod: 'PICKUP',
        rentalStartDate: '2026-08-01',
        rentalEndDate: '2026-08-03',
        requestedTimeZone: 'Africa/Accra',
      })
      .expect(201);
    expect(response.headers['x-rental-request-token']).toBe(capability);
    expect(response.headers['x-rental-cart-clear']).toBe('true');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(JSON.stringify(response.body)).not.toMatch(
      /token|contact|inventory|price|staff/i,
    );
  });

  it('supports private customer-safe tracking', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/rental-requests/MR-2026-ABCDEFGH23')
      .set('x-rental-request-token', capability)
      .expect(200);
    expect(response.body).toEqual(safeRequest);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});
