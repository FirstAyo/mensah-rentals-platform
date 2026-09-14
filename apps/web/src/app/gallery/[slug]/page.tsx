import type { Metadata } from 'next';
import { CalendarDays, ChevronRight, Images, MapPin } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GalleryLightbox } from '@/components/gallery-lightbox';
import { GalleryUnavailable } from '@/components/gallery-unavailable';
import {
  getPublicGalleryProject,
  PublicGalleryNotFound,
  PublicGalleryUnavailable,
} from '@/lib/public-gallery';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { serializeJsonLd } from '@/lib/structured-data';
import { gallerySlugSchema } from '@mensah-rentals/validation';

export const dynamic = 'force-dynamic';

async function projectFor(rawSlug: string) {
  const slug = gallerySlugSchema.safeParse(rawSlug);
  if (!slug.success) notFound();
  try {
    return await getPublicGalleryProject(slug.data);
  } catch (error) {
    if (error instanceof PublicGalleryNotFound) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const project = await projectFor((await params).slug);
    const path = `/gallery/${project.slug}`;
    return {
      title: { absolute: project.seo.title },
      description: project.seo.description,
      alternates: { canonical: path },
      openGraph: {
        title: project.seo.title,
        description: project.seo.description,
        images: [{ alt: project.cover.altText, url: project.cover.url }],
        type: 'website',
        url: path,
      },
      twitter: {
        card: 'summary_large_image',
        title: project.seo.title,
        description: project.seo.description,
        images: [project.cover.url],
      },
      robots: publicPageRobots(),
    };
  } catch (error) {
    if (error instanceof PublicGalleryUnavailable)
      return { title: 'Gallery', robots: publicPageRobots(false) };
    throw error;
  }
}

export default async function GalleryProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  let project;
  try {
    project = await projectFor((await params).slug);
  } catch (error) {
    if (!(error instanceof PublicGalleryUnavailable)) throw error;
    return (
      <main className="public-container py-16">
        <GalleryUnavailable />
      </main>
    );
  }

  const origin = siteOrigin();
  const path = `/gallery/${project.slug}`;
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Gallery',
        item: `${origin}/gallery`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: project.title,
        item: `${origin}${path}`,
      },
    ],
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
        type="application/ld+json"
      />
      <section className="relative isolate min-h-[28rem] overflow-hidden bg-slate-950 text-white sm:min-h-[34rem]">
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{
            backgroundImage: `url(${project.cover.url})`,
            backgroundPosition: project.cover.focalPoint,
          }}
        />
        <span className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/25 lg:bg-[linear-gradient(90deg,rgba(8,12,20,.94)_0%,rgba(8,12,20,.60)_58%,rgba(8,12,20,.25)_100%)]" />
        <div className="public-container flex min-h-[28rem] flex-col pb-12 pt-8 sm:min-h-[34rem] sm:pb-16">
          <nav aria-label="Breadcrumb" className="text-sm text-white/80">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  href="/"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="h-4 w-4" />
              </li>
              <li>
                <Link
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  href="/gallery"
                >
                  Gallery
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="h-4 w-4" />
              </li>
              <li aria-current="page" className="min-w-0 truncate">
                {project.title}
              </li>
            </ol>
          </nav>
          <div className="mt-auto max-w-4xl pt-14">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">
              {project.service.label}
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
              {project.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-100 sm:text-xl sm:leading-8">
              {project.shortDescription}
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-200">
              {project.location ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                  {project.location}
                </span>
              ) : null}
              {project.eventDate ? (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays aria-hidden="true" className="h-4 w-4" />
                  {new Intl.DateTimeFormat('en-CA', {
                    dateStyle: 'long',
                    timeZone: 'UTC',
                  }).format(new Date(`${project.eventDate}T00:00:00Z`))}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2">
                <Images aria-hidden="true" className="h-4 w-4" />
                {project.imageCount}{' '}
                {project.imageCount === 1 ? 'image' : 'images'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <main className="public-container py-12 sm:py-16 lg:py-20">
        {project.description ? (
          <p className="mb-10 max-w-4xl whitespace-pre-line text-lg leading-8 text-muted-foreground">
            {project.description}
          </p>
        ) : null}
        <GalleryLightbox images={project.media} projectTitle={project.title} />
        <section
          className="mt-16 rounded-3xl border border-border bg-card p-6 sm:p-10"
          aria-labelledby="gallery-project-cta"
        >
          <h2
            className="text-2xl font-bold sm:text-3xl"
            id="gallery-project-cta"
          >
            Planning something similar?
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
            Browse our rental catalogue or tell our team what your production,
            event, or function needs.
          </p>
          <div className="mt-6 flex flex-col gap-3 min-[380px]:flex-row">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
              href="/rentals"
            >
              Browse rentals
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 font-semibold"
              href="/contact"
            >
              Contact our team
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
