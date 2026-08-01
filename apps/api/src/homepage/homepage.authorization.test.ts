import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { ProductMediaService } from '../media/product-media.service';
import { HomepageModule } from './homepage.module';
import { HomepageService } from './homepage.service';
import { HomepageMediaService } from './homepage-media.service';

const baseUser: StaffUserResponse = {
  id: 'staff-id',
  email: 'staff@example.test',
  firstName: 'Staff',
  lastName: 'User',
  status: 'ACTIVE',
  lastLoginAt: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  roles: [],
  permissionKeys: [],
};

describe('homepage authorization and public visibility', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const homepage = {
    getPublicHomepage: vi.fn(async () => ({
      content: { hero: { heading: 'Safe homepage' } },
      categories: [],
      products: [],
      media: {},
      googleReviews: { live: false },
    })),
    getAdminHomepage: vi.fn(async () => ({
      lockVersion: 0,
      draft: null,
      published: null,
    })),
    googleReviewsStatus: vi.fn(() => ({
      liveReviewsEnabled: false,
      reviewsUrlConfigured: false,
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
              STAFF_SESSION_TTL_HOURS: 12,
              MEDIA_STORAGE_ROOT: 'storage/test-media',
            }),
          ],
        }),
        AuthModule,
        HomepageModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(HomepageService)
      .useValue(homepage)
      .overrideProvider(HomepageMediaService)
      .useValue({
        list: vi.fn(async () => []),
        listLibrary: vi.fn(async () => ({
          items: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 1,
        })),
      })
      .overrideProvider(ProductMediaService)
      .useValue({ normalizeImage: vi.fn() })
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => app.close());

  it('serves only the explicit public homepage without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/homepage')
      .expect(200);
    expect(response.body.content.hero.heading).toBe('Safe homepage');
    expect(JSON.stringify(response.body)).not.toMatch(
      /inventory|password|permission|draft|apiKey|placeId/i,
    );
  });

  it('returns 401 unauthenticated and 403 without homepage.view', async () => {
    current = null;
    await request(app.getHttpServer()).get('/admin/homepage').expect(401);
    current = baseUser;
    await request(app.getHttpServer())
      .get('/admin/homepage')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
  });

  it('allows only a user with the exact homepage permission', async () => {
    current = { ...baseUser, permissionKeys: ['homepage.view'] };
    await request(app.getHttpServer())
      .get('/admin/homepage')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    await request(app.getHttpServer())
      .get('/admin/homepage/google-reviews/status')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
    current = {
      ...baseUser,
      permissionKeys: ['homepage.google_reviews.view_status'],
    };
    const response = await request(app.getHttpServer())
      .get('/admin/homepage/google-reviews/status')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(/apiKey|placeId|secret/i);
  });

  it('requires both homepage and product visibility for reusable media selection', async () => {
    current = { ...baseUser, permissionKeys: ['homepage.view'] };
    await request(app.getHttpServer())
      .get('/admin/homepage/media/library')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
    current = {
      ...baseUser,
      permissionKeys: ['homepage.view', 'product.view'],
    };
    const response = await request(app.getHttpServer())
      .get('/admin/homepage/media/library')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    expect(response.body.items).toEqual([]);
  });

  it('does not permit a read-only viewer to mutate category covers', async () => {
    current = {
      ...baseUser,
      permissionKeys: ['category.view', 'homepage.view'],
    };
    await request(app.getHttpServer())
      .put('/admin/categories/cm00000000000000000000000/cover-image')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({
        mediaRef: 'cm00000000000000000000000',
        altText: 'Cover',
        focalPoint: 'center',
      })
      .expect(403);
  });
});
