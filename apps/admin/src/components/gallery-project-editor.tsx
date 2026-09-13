'use client';

import type {
  AdminGalleryMediaResponse,
  AdminGalleryProjectResponse,
  PublicGalleryProjectResponse,
} from '@mensah-rentals/types';
import {
  GALLERY_SERVICE_PRESENTATION,
  galleryProjectContentSchema,
  galleryServiceTypes,
  type GalleryProjectContentInput,
} from '@mensah-rentals/validation';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  Send,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { adminHomepageMediaUrl } from '@/lib/homepage-media-url';
import {
  MediaPickerDialog,
  mediaPreviewUrl,
  type MediaLibraryItem,
} from './media-picker-dialog';

const blankContent: GalleryProjectContentInput = {
  slug: '',
  title: '',
  serviceType: 'FILM_PRODUCTION',
  shortDescription: '',
  description: null,
  eventDate: null,
  location: null,
  featured: false,
  sortOrder: 0,
  seoTitle: null,
  seoDescription: null,
};

type EditableMedia = AdminGalleryMediaResponse & { previewUrl: string };

function messageFrom(response: Response, fallback: string) {
  return response
    .json()
    .then((body: { message?: string }) => body.message ?? fallback)
    .catch(() => fallback);
}

function fromAdmin(item: AdminGalleryMediaResponse): EditableMedia {
  return {
    ...item,
    previewUrl: adminHomepageMediaUrl({ id: item.mediaId, url: item.url }),
  };
}

export function GalleryProjectEditor({
  canEdit,
  canManageMedia,
  canPreview,
  canPublish,
  projectId,
}: {
  canEdit: boolean;
  canManageMedia: boolean;
  canPreview: boolean;
  canPublish: boolean;
  projectId?: string;
}) {
  const [project, setProject] = useState<AdminGalleryProjectResponse | null>(
    null,
  );
  const [content, setContent] =
    useState<GalleryProjectContentInput>(blankContent);
  const [media, setMedia] = useState<EditableMedia[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<PublicGalleryProjectResponse | null>(
    null,
  );
  const pickerTrigger = useRef<HTMLButtonElement>(null);

  const apply = useCallback((value: AdminGalleryProjectResponse) => {
    setProject(value);
    const revision = value.draft ?? value.publishedRevision;
    if (revision) {
      setContent(revision.content);
      setMedia(revision.media.map(fromAdmin));
    }
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/gallery/${projectId}`, {
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          await messageFrom(response, 'Gallery project could not be loaded.'),
        );
      apply((await response.json()) as AdminGalleryProjectResponse);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Gallery project could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [apply, projectId]);

  useEffect(() => void load(), [load]);

  function update<K extends keyof GalleryProjectContentInput>(
    key: K,
    value: GalleryProjectContentInput[K],
  ) {
    setContent((current) => ({ ...current, [key]: value }));
  }

  function addMedia(item: MediaLibraryItem) {
    if (media.some((entry) => entry.mediaId === item.id)) {
      setNotice('That image is already in this project.');
      return;
    }
    setMedia((current) => [
      ...current,
      {
        altText: item.description || item.label,
        focalPoint: 'center',
        mediaId: item.id,
        url: item.url,
        previewUrl: mediaPreviewUrl(item),
      },
    ]);
    setNotice('Image added. Review its alternative text before saving.');
  }

  async function mutate(action: 'save' | 'publish' | 'unpublish' | 'archive') {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      let url = '/api/gallery';
      let body: unknown;
      if (action === 'save') {
        const parsed = galleryProjectContentSchema.safeParse(content);
        if (!parsed.success)
          throw new Error(
            parsed.error.issues[0]?.message ?? 'Check the project details.',
          );
        if (!media.length) throw new Error('Add at least one Gallery image.');
        if (media.some((item) => !item.altText.trim()))
          throw new Error('Every image needs descriptive alternative text.');
        body = {
          operationId: crypto.randomUUID(),
          ...(project ? { expectedLockVersion: project.lockVersion } : {}),
          content: parsed.data,
          media: media.map(({ mediaId, altText, focalPoint }) => ({
            mediaId,
            altText: altText.trim(),
            focalPoint,
          })),
        };
        if (project) url = `/api/gallery/${project.id}/drafts`;
      } else {
        if (!project) throw new Error('Save the project before continuing.');
        body = {
          operationId: crypto.randomUUID(),
          expectedLockVersion: project.lockVersion,
        };
        if (action === 'publish') {
          if (!project.draft)
            throw new Error('There is no current draft to publish.');
          url = `/api/gallery/${project.id}/drafts/${project.draft.id}/publish`;
        } else if (action === 'unpublish') {
          if (!project.published)
            throw new Error('This Gallery project is not published.');
          if (
            !window.confirm(
              'Unpublish this Gallery project? It will disappear from the public Gallery, but its history and an editable draft will be preserved.',
            )
          )
            return;
          url = `/api/gallery/${project.id}/unpublish`;
        } else {
          if (
            !window.confirm(
              'Archive this Gallery project? It will be removed from the public Gallery, while history is preserved.',
            )
          )
            return;
          url = `/api/gallery/${project.id}/archive`;
        }
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(
          await messageFrom(response, 'The Gallery change could not be saved.'),
        );
      const result = (await response.json()) as AdminGalleryProjectResponse;
      apply(result);
      setPreview(null);
      setNotice(
        action === 'save'
          ? 'Draft saved.'
          : action === 'publish'
            ? 'Gallery project published.'
            : action === 'unpublish'
              ? 'Gallery project unpublished. Its editable draft and publication history were preserved.'
              : 'Gallery project archived.',
      );
      if (!projectId && action === 'save')
        window.history.replaceState(null, '', `/website/gallery/${result.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The Gallery change could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function showPreview() {
    const revision = project?.draft ?? project?.publishedRevision;
    if (!project || !revision) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/gallery/${project.id}/revisions/${revision.id}/preview`,
        { cache: 'no-store' },
      );
      if (!response.ok)
        throw new Error(
          await messageFrom(response, 'Preview could not be loaded.'),
        );
      setPreview((await response.json()) as PublicGalleryProjectResponse);
      window.setTimeout(
        () => document.getElementById('gallery-preview')?.focus(),
        0,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Preview could not be loaded.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p aria-live="polite">Loading Gallery project…</p>;
  if (projectId && error && !project)
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/40 bg-card p-6"
      >
        {error}
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            href="/website/gallery"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Gallery
            projects
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {project ? project.title : 'New Gallery project'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Draft changes remain private until you explicitly publish them.
          </p>
        </div>
        {project ? (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border bg-card px-3 py-1 text-sm">
              Version{' '}
              {project.draft?.version ??
                project.publishedRevision?.version ??
                0}
            </span>
            <span className="rounded-full border bg-card px-3 py-1 text-sm">
              {project.archivedAt
                ? 'Archived'
                : project.published
                  ? 'Published'
                  : 'Draft'}
            </span>
          </div>
        ) : null}
      </header>

      {notice ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <fieldset
        disabled={!canEdit || busy || Boolean(project?.archivedAt)}
        className="space-y-6 disabled:opacity-80"
      >
        <legend className="sr-only">Gallery project details</legend>
        <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6 md:grid-cols-2">
          <h2 className="col-span-full text-xl font-semibold">Project story</h2>
          <Field label="Title">
            <input
              className="control"
              maxLength={180}
              onChange={(e) => update('title', e.target.value)}
              value={content.title}
            />
          </Field>
          <Field label="URL slug">
            <input
              className="control"
              maxLength={160}
              onChange={(e) => update('slug', e.target.value)}
              placeholder="project-name"
              value={content.slug}
            />
          </Field>
          <Field label="Service">
            <select
              className="control"
              onChange={(e) =>
                update(
                  'serviceType',
                  e.target.value as GalleryProjectContentInput['serviceType'],
                )
              }
              value={content.serviceType}
            >
              {galleryServiceTypes.map((type) => (
                <option key={type} value={type}>
                  {GALLERY_SERVICE_PRESENTATION[type].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Event date (optional)">
            <input
              className="control"
              onChange={(e) => update('eventDate', e.target.value || null)}
              type="date"
              value={content.eventDate ?? ''}
            />
          </Field>
          <Field label="Location (optional)">
            <input
              className="control"
              maxLength={240}
              onChange={(e) => update('location', e.target.value || null)}
              value={content.location ?? ''}
            />
          </Field>
          <Field label="Sort order">
            <input
              className="control"
              min={0}
              max={10000}
              onChange={(e) => update('sortOrder', Number(e.target.value))}
              type="number"
              value={content.sortOrder}
            />
          </Field>
          <Field full label="Short description">
            <textarea
              className="control min-h-24"
              maxLength={400}
              onChange={(e) => update('shortDescription', e.target.value)}
              value={content.shortDescription}
            />
          </Field>
          <Field full label="Full story (optional)">
            <textarea
              className="control min-h-40"
              maxLength={5000}
              onChange={(e) => update('description', e.target.value || null)}
              value={content.description ?? ''}
            />
          </Field>
          <label className="col-span-full flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              checked={content.featured}
              onChange={(e) => update('featured', e.target.checked)}
              type="checkbox"
            />{' '}
            Feature this project where Gallery highlights are used
          </label>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Project images</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The first image is the cover. Reorder images and write
                meaningful alternative text.
              </p>
            </div>
            {canEdit ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold"
                onClick={() => setPickerOpen(true)}
                ref={pickerTrigger}
                type="button"
              >
                <ImagePlus aria-hidden="true" className="h-4 w-4" /> Add image
              </button>
            ) : null}
          </div>
          {!media.length ? (
            <div className="grid min-h-32 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No images selected.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {media.map((item, index) => (
                <article
                  className="grid gap-4 rounded-xl border p-3 sm:grid-cols-[10rem_1fr]"
                  key={item.mediaId}
                >
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                    <Image
                      alt=""
                      className="object-cover"
                      fill
                      sizes="160px"
                      src={item.previewUrl}
                    />
                  </div>
                  <div className="min-w-0 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {index === 0 ? 'Cover image' : `Image ${index + 1}`}
                      </span>
                      <div className="flex gap-1">
                        <IconButton
                          label="Move image up"
                          disabled={index === 0}
                          onClick={() =>
                            setMedia((items) => move(items, index, index - 1))
                          }
                        >
                          <ArrowUp />
                        </IconButton>
                        <IconButton
                          label="Move image down"
                          disabled={index === media.length - 1}
                          onClick={() =>
                            setMedia((items) => move(items, index, index + 1))
                          }
                        >
                          <ArrowDown />
                        </IconButton>
                        <IconButton
                          label="Remove image"
                          onClick={() =>
                            setMedia((items) =>
                              items.filter(
                                (entry) => entry.mediaId !== item.mediaId,
                              ),
                            )
                          }
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    </div>
                    <Field label="Alternative text">
                      <input
                        className="control"
                        maxLength={300}
                        onChange={(e) =>
                          setMedia((items) =>
                            items.map((entry) =>
                              entry.mediaId === item.mediaId
                                ? { ...entry, altText: e.target.value }
                                : entry,
                            ),
                          )
                        }
                        value={item.altText}
                      />
                    </Field>
                    <Field label="Focal point">
                      <select
                        className="control"
                        onChange={(e) =>
                          setMedia((items) =>
                            items.map((entry) =>
                              entry.mediaId === item.mediaId
                                ? { ...entry, focalPoint: e.target.value }
                                : entry,
                            ),
                          )
                        }
                        value={item.focalPoint}
                      >
                        {['center', 'top', 'bottom', 'left', 'right'].map(
                          (value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6 md:grid-cols-2">
          <h2 className="col-span-full text-xl font-semibold">
            Search preview
          </h2>
          <Field label="SEO title (optional)">
            <input
              className="control"
              maxLength={70}
              onChange={(e) => update('seoTitle', e.target.value || null)}
              value={content.seoTitle ?? ''}
            />
          </Field>
          <Field label="SEO description (optional)">
            <textarea
              className="control min-h-24"
              maxLength={180}
              onChange={(e) => update('seoDescription', e.target.value || null)}
              value={content.seoDescription ?? ''}
            />
          </Field>
        </section>
      </fieldset>

      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        {canEdit && !project?.archivedAt ? (
          <button
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void mutate('save')}
            type="button"
          >
            {busy ? 'Working…' : 'Save draft'}
          </button>
        ) : null}
        {canPreview && project ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void showPreview()}
            type="button"
          >
            <Eye aria-hidden="true" className="h-4 w-4" /> Preview current
            revision
          </button>
        ) : null}
        {canPublish && project?.draft && !project.archivedAt ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50"
            disabled={busy}
            onClick={() => void mutate('publish')}
            type="button"
          >
            <Send aria-hidden="true" className="h-4 w-4" /> Publish draft
          </button>
        ) : null}
        {canPublish && project?.published && !project.archivedAt ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void mutate('unpublish')}
            type="button"
          >
            <EyeOff aria-hidden="true" className="h-4 w-4" /> Unpublish
          </button>
        ) : null}
        {canPublish && project && !project.archivedAt ? (
          <button
            className="min-h-11 rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive disabled:opacity-50"
            disabled={busy}
            onClick={() => void mutate('archive')}
            type="button"
          >
            Archive project
          </button>
        ) : null}
      </div>

      {preview ? (
        <section
          aria-label="Gallery draft preview"
          className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
          id="gallery-preview"
          tabIndex={-1}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Private draft preview
              </p>
              <h2 className="mt-2 text-2xl font-bold">{preview.title}</h2>
              <p className="mt-1 text-muted-foreground">
                {preview.service.label}
                {preview.location ? ` · ${preview.location}` : ''}
              </p>
            </div>
            <button
              className="min-h-11 rounded-lg border px-4 text-sm font-semibold"
              onClick={() => setPreview(null)}
              type="button"
            >
              Close preview
            </button>
          </div>
          <p className="max-w-3xl">{preview.shortDescription}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preview.media.map((item, index) => (
              <div
                className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
                key={`${item.url}-${index}`}
              >
                <Image
                  alt={item.altText}
                  className="object-cover"
                  fill
                  sizes="(min-width:1024px) 30vw, 50vw"
                  src={item.url}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {project?.history.length ? (
        <section className="rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Revision history</h2>
          <ul className="mt-4 divide-y">
            {project.history.map((revision) => (
              <li
                className="flex flex-wrap justify-between gap-3 py-3 text-sm"
                key={revision.id}
              >
                <span>
                  Version {revision.version} · {revision.kind.toLowerCase()}
                </span>
                <time dateTime={revision.createdAt}>
                  {new Date(revision.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MediaPickerDialog
        canUpload={canManageMedia}
        label="Gallery project"
        onClose={() => setPickerOpen(false)}
        onNotice={setNotice}
        onSelect={(item) => {
          addMedia(item);
          setPickerOpen(false);
        }}
        open={pickerOpen}
        returnFocusRef={pickerTrigger}
      />
    </div>
  );
}

function Field({
  children,
  full = false,
  label,
}: {
  children: React.ReactNode;
  full?: boolean;
  label: string;
}) {
  return (
    <label className={`text-sm font-medium ${full ? 'md:col-span-2' : ''}`}>
      {label}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactElement<{ className?: string }>;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-lg border disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}
