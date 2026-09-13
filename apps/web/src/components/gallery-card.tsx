import type { PublicGalleryProjectSummaryResponse } from '@mensah-rentals/types';
import { ArrowUpRight, Images, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export function GalleryCard({
  project,
  priority = false,
}: {
  project: PublicGalleryProjectSummaryResponse;
  priority?: boolean;
}) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none">
      <Link
        aria-label={`View ${project.title}`}
        className="relative block aspect-[4/3] overflow-hidden bg-muted outline-none"
        href={`/gallery/${project.slug}`}
      >
        <Image
          alt={project.cover.altText}
          className="object-cover transition duration-500 group-hover:scale-[1.035] motion-reduce:transform-none motion-reduce:transition-none"
          fill
          priority={priority}
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
          src={project.cover.url}
          style={{ objectPosition: project.cover.focalPoint }}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
        <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-slate-950/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {project.service.label}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          <Link
            className="rounded-sm outline-none"
            href={`/gallery/${project.slug}`}
          >
            {project.title}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {project.shortDescription}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-xs text-muted-foreground">
          {project.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              {project.location}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Images aria-hidden="true" className="h-3.5 w-3.5" />
            {project.imageCount} {project.imageCount === 1 ? 'image' : 'images'}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary">
            View project
            <ArrowUpRight
              aria-hidden="true"
              className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
            />
          </span>
        </div>
      </div>
    </article>
  );
}
