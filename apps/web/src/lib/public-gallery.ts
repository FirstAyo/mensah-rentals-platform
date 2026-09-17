import 'server-only';

import type {
  PublicGalleryMediaResponse,
  PublicGalleryPhotoResponse,
  PublicGalleryProjectResponse,
  PublicGalleryProjectSummaryResponse,
  PublicGalleryResponse,
} from '@mensah-rentals/types';
import {
  galleryServiceSlugSchema,
  type GalleryServiceSlug,
} from '@mensah-rentals/validation';

export class PublicGalleryNotFound extends Error {}
export class PublicGalleryUnavailable extends Error {}

const forbidden =
  /inventory|quantity|stock|available|remaining|reserved|rented|damaged|maintenance|lost|asset|serial|transaction|internal|staff|role|permission|password|token|operation|payload|createdBy|publishedBy|storagePath|mediaId|databaseId|draft|audit/i;

function assertSafe(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertSafe);
  if (value && typeof value === 'object')
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key))
        throw new PublicGalleryUnavailable('Unsafe public Gallery response.');
      assertSafe(nested);
    }
}

function record(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PublicGalleryUnavailable(`Invalid public ${label} response.`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new PublicGalleryUnavailable(`Unsafe public ${label} response.`);
}

function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim())
    throw new PublicGalleryUnavailable(`Invalid public ${label} response.`);
}

function nullableText(
  value: unknown,
  label: string,
): asserts value is string | null {
  if (value !== null && typeof value !== 'string')
    throw new PublicGalleryUnavailable(`Invalid public ${label} response.`);
}

function media(value: unknown): asserts value is PublicGalleryMediaResponse {
  record(
    value,
    ['altText', 'focalPoint', 'height', 'url', 'width'],
    'Gallery media',
  );
  text(value.altText, 'Gallery media alt text');
  text(value.url, 'Gallery media URL');
  if (
    !/^\/media\/homepage\/[a-z0-9]+\/[a-f0-9]{64}\.webp$/.test(value.url) ||
    !['center', 'top', 'bottom', 'left', 'right'].includes(
      String(value.focalPoint),
    )
  )
    throw new PublicGalleryUnavailable(
      'Invalid public Gallery media response.',
    );
  if (
    !Number.isInteger(value.width) ||
    Number(value.width) < 1 ||
    !Number.isInteger(value.height) ||
    Number(value.height) < 1
  )
    throw new PublicGalleryUnavailable(
      'Invalid public Gallery image dimensions.',
    );
}

function photo(value: unknown): asserts value is PublicGalleryPhotoResponse {
  record(
    value,
    ['event', 'eventImageCount', 'eventImageIndex', 'image', 'key', 'service'],
    'Gallery photo',
  );
  text(value.key, 'Gallery photo key');
  media(value.image);
  record(
    value.event,
    ['shortDescription', 'slug', 'title'],
    'Gallery photo event',
  );
  text(value.event.slug, 'Gallery event slug');
  text(value.event.title, 'Gallery event title');
  text(value.event.shortDescription, 'Gallery event description');
  record(value.service, ['label', 'slug'], 'Gallery photo service');
  text(value.service.label, 'Gallery photo service label');
  galleryServiceSlugSchema.parse(value.service.slug);
  if (
    !Number.isInteger(value.eventImageIndex) ||
    Number(value.eventImageIndex) < 1 ||
    !Number.isInteger(value.eventImageCount) ||
    Number(value.eventImageCount) < Number(value.eventImageIndex)
  )
    throw new PublicGalleryUnavailable('Invalid public Gallery photo index.');
}

function summary(
  value: unknown,
): asserts value is PublicGalleryProjectSummaryResponse {
  record(
    value,
    [
      'eventDate',
      'imageCount',
      'location',
      'cover',
      'service',
      'shortDescription',
      'slug',
      'title',
    ],
    'Gallery project',
  );
  text(value.slug, 'Gallery project slug');
  text(value.title, 'Gallery project title');
  text(value.shortDescription, 'Gallery project description');
  nullableText(value.eventDate, 'Gallery project date');
  nullableText(value.location, 'Gallery project location');
  if (!Number.isInteger(value.imageCount) || Number(value.imageCount) < 1)
    throw new PublicGalleryUnavailable('Invalid public Gallery image count.');
  media(value.cover);
  record(value.service, ['label', 'slug'], 'Gallery service');
  text(value.service.label, 'Gallery service label');
  galleryServiceSlugSchema.parse(value.service.slug);
}

function gallery(value: unknown): asserts value is PublicGalleryResponse {
  record(
    value,
    ['items', 'meta', 'photos', 'selectedEvent', 'selectedType', 'services'],
    'Gallery',
  );
  if (
    !Array.isArray(value.items) ||
    !Array.isArray(value.photos) ||
    !Array.isArray(value.services)
  )
    throw new PublicGalleryUnavailable('Invalid public Gallery response.');
  value.items.forEach(summary);
  value.photos.forEach(photo);
  nullableText(value.selectedEvent, 'Gallery event filter');
  if (value.selectedType !== null)
    galleryServiceSlugSchema.parse(value.selectedType);
  value.services.forEach((service) => {
    record(service, ['label', 'slug'], 'Gallery service');
    text(service.label, 'Gallery service label');
    galleryServiceSlugSchema.parse(service.slug);
  });
  const meta = value.meta;
  record(
    meta,
    ['hasMore', 'page', 'pageSize', 'total', 'totalPages'],
    'Gallery pagination',
  );
  if (
    typeof meta.hasMore !== 'boolean' ||
    !['page', 'pageSize', 'total', 'totalPages'].every((key) =>
      Number.isInteger(meta[key]),
    )
  )
    throw new PublicGalleryUnavailable('Invalid Gallery pagination response.');
}

function detail(value: unknown): asserts value is PublicGalleryProjectResponse {
  record(
    value,
    [
      'eventDate',
      'imageCount',
      'location',
      'cover',
      'service',
      'shortDescription',
      'slug',
      'title',
      'description',
      'media',
      'seo',
    ],
    'Gallery project detail',
  );
  const base = { ...value };
  delete base.description;
  delete base.media;
  delete base.seo;
  summary(base);
  nullableText(value.description, 'Gallery project long description');
  if (!Array.isArray(value.media) || value.media.length < 1)
    throw new PublicGalleryUnavailable(
      'Invalid public Gallery media response.',
    );
  value.media.forEach(media);
  record(value.seo, ['title', 'description'], 'Gallery SEO');
  text(value.seo.title, 'Gallery SEO title');
  text(value.seo.description, 'Gallery SEO description');
}

async function request(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}${path}`,
      { cache: 'no-store' },
    );
  } catch (cause) {
    throw new PublicGalleryUnavailable(
      'Our Gallery is temporarily unavailable.',
      { cause },
    );
  }
  if (response.status === 404) throw new PublicGalleryNotFound();
  if (!response.ok)
    throw new PublicGalleryUnavailable(
      'Our Gallery is temporarily unavailable.',
    );
  const body: unknown = await response.json();
  assertSafe(body);
  return body;
}

export async function getPublicGallery(
  type?: GalleryServiceSlug,
  options: { event?: string; page?: number; pageSize?: number } = {},
) {
  const query = new URLSearchParams();
  if (type) query.set('type', type);
  if (options.event) query.set('event', options.event);
  if (options.page) query.set('page', String(options.page));
  if (options.pageSize) query.set('pageSize', String(options.pageSize));
  const body = await request(
    `/public/gallery${query.size ? `?${query.toString()}` : ''}`,
  );
  gallery(body);
  return body;
}

export async function getPublicGalleryProject(slug: string) {
  const body = await request(`/public/gallery/${encodeURIComponent(slug)}`);
  detail(body);
  return body;
}
