import { NextResponse } from 'next/server';
import {
  galleryServiceSlugSchema,
  gallerySlugSchema,
} from '@mensah-rentals/validation';

import { GALLERY_PAGE_SIZE } from '@/lib/gallery-photo-layout';
import {
  getPublicGallery,
  PublicGalleryUnavailable,
} from '@/lib/public-gallery';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some((key) => !['event', 'page', 'type'].includes(key))
  )
    return NextResponse.json(
      { message: 'Invalid Gallery request.' },
      { status: 400 },
    );

  const page = Number(params.get('page') ?? '1');
  const type = params.get('type');
  const event = params.get('event');
  const parsedType = type ? galleryServiceSlugSchema.safeParse(type) : null;
  const parsedEvent = event ? gallerySlugSchema.safeParse(event) : null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000 ||
    (parsedType && !parsedType.success) ||
    (parsedEvent && !parsedEvent.success)
  )
    return NextResponse.json(
      { message: 'Invalid Gallery request.' },
      { status: 400 },
    );

  try {
    const gallery = await getPublicGallery(parsedType?.data, {
      event: parsedEvent?.data,
      page,
      pageSize: GALLERY_PAGE_SIZE,
    });
    return NextResponse.json(gallery, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    if (!(error instanceof PublicGalleryUnavailable)) throw error;
    return NextResponse.json(
      { message: 'The Gallery is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
