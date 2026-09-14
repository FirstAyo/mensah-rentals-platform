import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { GalleryModule } from './gallery.module';
import { GalleryService } from './gallery.service';

const baseUser: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'gallery-staff@example.test',
  firstName: 'Gallery',
  id: 'staff-id',
  lastLoginAt: null,
  lastName: 'Staff',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

const content = {
  slug: 'safe-project',
  title: 'Safe project',
  serviceType: 'FILM_PRODUCTION',
  shortDescription: 'A public-safe Gallery project.',
  description: null,
  eventDate: null,
  location: null,
  featured: false,
  sortOrder: 0,
  seoTitle: null,
  seoDescription: null,
} as const;

describe('Gallery authorization and public visibility', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const gallery = {
    adminDetail: vi.fn(async () => ({ id: 'project-id' })),
    adminList: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    archive: vi.fn(async () => ({ id: 'project-id' })),
    create: vi.fn(async () => ({ id: 'project-id' })),
    createAndPublish: vi.fn(async () => ({ id: 'project-id' })),
    preview: vi.fn(async () => ({
      slug: 'safe-project',
      title: 'Safe project',
      media: [],
    })),
    publicDetail: vi.fn(async () => ({
      slug: 'safe-project',
      title: 'Safe project',
      media: [],
    })),
    publicList: vi.fn(async () => ({
      items: [],
      selectedType: null,
      services: [],
    })),
    publish: vi.fn(async () => ({ id: 'project-id' })),
    saveDraft: vi.fn(async () => ({ id: 'project-id' })),
    saveAndPublish: vi.fn(async () => ({ id: 'project-id' })),
    unpublish: vi.fn(async () => ({ id: 'project-id' })),
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
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        GalleryModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(GalleryService)
      .useValue(gallery)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('serves public-safe Gallery routes without authentication', async () => {
    const list = await request(app.getHttpServer())
      .get('/public/gallery?type=film-production')
      .expect(200);
    await request(app.getHttpServer())
      .get('/public/gallery/safe-project')
      .expect(200);
    expect(JSON.stringify(list.body)).not.toMatch(
      /inventory|staff|permission|operationId|payloadHash|storagePath/i,
    );
  });

  it('rejects invalid public filters and slugs', async () => {
    await request(app.getHttpServer())
      .get('/public/gallery?type=unknown')
      .expect(400);
    await request(app.getHttpServer())
      .get('/public/gallery/Unsafe%20Slug')
      .expect(400);
  });

  it('returns 401 unauthenticated and 403 without Gallery permission', async () => {
    current = null;
    await request(app.getHttpServer())
      .get('/admin/gallery/projects')
      .expect(401);
    current = baseUser;
    await request(app.getHttpServer())
      .get('/admin/gallery/projects')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
  });

  it('separates Gallery view, edit, preview, and publish permissions', async () => {
    const id = 'cm00000000000000000000000';
    const revisionId = 'cm00000000000000000000001';
    const operationId = 'fa40e80b-b72c-4d4c-ad4f-4489bd6136a1';
    current = { ...baseUser, permissionKeys: ['gallery.view'] };
    await request(app.getHttpServer())
      .get('/admin/gallery/projects')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    await request(app.getHttpServer())
      .post('/admin/gallery/projects')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({
        operationId,
        content,
        media: [{ mediaId: id, altText: 'Event' }],
      })
      .expect(403);
    current = { ...baseUser, permissionKeys: ['gallery.edit'] };
    await request(app.getHttpServer())
      .post('/admin/gallery/projects')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({
        operationId,
        content,
        media: [{ mediaId: id, altText: 'Event' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/gallery/projects/publish')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({
        operationId: crypto.randomUUID(),
        slugMode: 'AUTO',
        content,
        media: [{ mediaId: id, altText: 'Event' }],
      })
      .expect(403);
    current = {
      ...baseUser,
      permissionKeys: ['gallery.edit', 'gallery.publish'],
    };
    await request(app.getHttpServer())
      .post('/admin/gallery/projects/publish')
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({
        operationId: crypto.randomUUID(),
        slugMode: 'AUTO',
        content,
        media: [{ mediaId: id, altText: 'Event' }],
      })
      .expect(201);
    current = { ...baseUser, permissionKeys: ['gallery.preview'] };
    await request(app.getHttpServer())
      .get(`/admin/gallery/projects/${id}/revisions/${revisionId}/preview`)
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/admin/gallery/projects/${id}/unpublish`)
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({ expectedLockVersion: 2, operationId: crypto.randomUUID() })
      .expect(403);
    current = { ...baseUser, permissionKeys: ['gallery.publish'] };
    await request(app.getHttpServer())
      .post(`/admin/gallery/projects/${id}/drafts/${revisionId}/publish`)
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({ expectedLockVersion: 1, operationId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/gallery/projects/${id}/unpublish`)
      .set('Cookie', 'mensah_staff_session=x')
      .set('Origin', 'http://localhost:3001')
      .send({ expectedLockVersion: 2, operationId: crypto.randomUUID() })
      .expect(201);
  });
});
