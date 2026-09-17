import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  getPublicGalleryProject,
  PublicGalleryNotFound,
} from '@/lib/public-gallery';
import { publicPageRobots } from '@/lib/site-config';
import { gallerySlugSchema } from '@mensah-rentals/validation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gallery',
  alternates: { canonical: '/gallery' },
  robots: publicPageRobots(false),
};

export default async function LegacyGalleryProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const parsed = gallerySlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();

  try {
    const project = await getPublicGalleryProject(parsed.data);
    permanentRedirect(`/gallery?event=${encodeURIComponent(project.slug)}`);
  } catch (error) {
    if (error instanceof PublicGalleryNotFound) notFound();
    throw error;
  }
}
