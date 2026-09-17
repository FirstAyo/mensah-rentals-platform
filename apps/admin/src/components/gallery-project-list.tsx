'use client';

import type { AdminGalleryListResponse } from '@mensah-rentals/types';
import {
  GALLERY_SERVICE_PRESENTATION,
  galleryServiceTypes,
  type GalleryServiceType,
} from '@mensah-rentals/validation';
import { Images, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const states = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export function GalleryProjectList({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<AdminGalleryListResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<(typeof states)[number]>('ALL');
  const [serviceType, setServiceType] = useState<GalleryServiceType | ''>('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        search: search.trim(),
        state,
      });
      if (serviceType) query.set('serviceType', serviceType);
      const response = await fetch(`/api/gallery?${query}`, {
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error('Gallery projects could not be loaded.');
      setData((await response.json()) as AdminGalleryListResponse);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Gallery projects could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, serviceType, state]);

  useEffect(() => void load(), [load]);

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Website content</p>
          <h1 className="text-3xl font-bold tracking-tight">Gallery</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Curate photo-led events and publish only reviewed drafts to the
            public Gallery.
          </p>
        </div>
        {canEdit ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            href="/website/gallery/new"
          >
            <Plus aria-hidden="true" className="h-4 w-4" /> New project
          </Link>
        ) : null}
      </header>

      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_16rem_14rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          void load();
        }}
      >
        <label className="text-sm font-medium">
          Search
          <input
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title or slug"
            value={search}
          />
        </label>
        <label className="text-sm font-medium">
          Service
          <select
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3"
            onChange={(event) => {
              setServiceType(event.target.value as GalleryServiceType | '');
              setPage(1);
            }}
            value={serviceType}
          >
            <option value="">All services</option>
            {galleryServiceTypes.map((type) => (
              <option key={type} value={type}>
                {GALLERY_SERVICE_PRESENTATION[type].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          State
          <select
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3"
            onChange={(event) => {
              setState(event.target.value as (typeof states)[number]);
              setPage(1);
            }}
            value={state}
          >
            {states.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL' ? 'All states' : value.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 self-end rounded-lg border border-border px-4 text-sm font-semibold"
          type="submit"
        >
          Apply
        </button>
      </form>

      {loading ? (
        <div
          aria-live="polite"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <div
              className="h-72 animate-pulse rounded-xl bg-muted"
              key={item}
            />
          ))}
        </div>
      ) : error ? (
        <div
          className="rounded-xl border border-destructive/40 bg-card p-6"
          role="alert"
        >
          <p className="font-semibold">Gallery projects are unavailable.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            className="mt-4 min-h-11 rounded-lg border px-4"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : !data?.items.length ? (
        <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-card p-8 text-center">
          <div>
            <Images
              aria-hidden="true"
              className="mx-auto h-8 w-8 text-muted-foreground"
            />
            <h2 className="mt-3 text-lg font-semibold">
              No Gallery projects found
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a project or change the current filters.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((project) => (
              <Link
                className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
                href={`/website/gallery/${project.id}`}
                key={project.id}
              >
                <div className="relative aspect-[16/9] bg-muted">
                  {project.coverUrl ? (
                    <Image
                      alt=""
                      className="object-cover transition duration-300 group-hover:scale-[1.02]"
                      fill
                      sizes="(min-width:1280px) 30vw, (min-width:640px) 50vw, 100vw"
                      src={project.coverUrl}
                    />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <Images
                        aria-hidden="true"
                        className="h-7 w-7 text-muted-foreground"
                      />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                      {GALLERY_SERVICE_PRESENTATION[project.serviceType].label}
                    </span>
                    <span className="rounded-full border px-2.5 py-1">
                      {project.archivedAt
                        ? 'Archived'
                        : project.published
                          ? 'Published'
                          : 'Draft'}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold">
                    {project.title}
                  </h2>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    /{project.slug}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Photos</dt>
                      <dd className="mt-1 font-semibold">
                        {project.imageCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last updated</dt>
                      <dd className="mt-1 font-semibold">
                        {new Intl.DateTimeFormat('en-CA', {
                          dateStyle: 'medium',
                        }).format(new Date(project.updatedAt))}
                      </dd>
                    </div>
                    {project.publishedAt ? (
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Published</dt>
                        <dd className="mt-1 font-semibold">
                          {new Intl.DateTimeFormat('en-CA', {
                            dateStyle: 'medium',
                          }).format(new Date(project.publishedAt))}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <span className="mt-4 inline-flex min-h-10 items-center font-semibold text-primary">
                    {canEdit ? 'Edit event' : 'View event'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <nav
            aria-label="Gallery pagination"
            className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4 text-sm"
          >
            <span>
              Page {data.meta.page} of {Math.max(data.meta.totalPages, 1)} ·{' '}
              {data.meta.total} projects
            </span>
            <div className="flex gap-2">
              <button
                className="min-h-11 rounded-lg border px-4 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                className="min-h-11 rounded-lg border px-4 disabled:opacity-50"
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((value) => value + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
