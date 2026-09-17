'use client';

import type {
  AdminGalleryMediaResponse,
  AdminGalleryProjectResponse,
  PublicGalleryProjectResponse,
} from '@mensah-rentals/types';
import {
  GALLERY_PROJECT_MEDIA_LIMIT,
  GALLERY_SERVICE_PRESENTATION,
  createGallerySlug,
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
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { adminHomepageMediaUrl } from '@/lib/homepage-media-url';
import {
  MediaPickerDialog,
  ManagedMediaPreview,
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
type FieldErrors = Record<string, string>;

const galleryFieldOrder = [
  'title',
  'slug',
  'serviceType',
  'eventDate',
  'location',
  'sortOrder',
  'shortDescription',
  'description',
  'media',
  'seoTitle',
  'seoDescription',
] as const;

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
  publicOrigin,
}: {
  canEdit: boolean;
  canManageMedia: boolean;
  canPreview: boolean;
  canPublish: boolean;
  projectId?: string;
  publicOrigin: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState<AdminGalleryProjectResponse | null>(
    null,
  );
  const [content, setContent] =
    useState<GalleryProjectContentInput>(blankContent);
  const [media, setMedia] = useState<EditableMedia[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [busyAction, setBusyAction] = useState<
    'save' | 'publish' | 'unpublish' | 'archive' | 'preview' | null
  >(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pendingFocusField, setPendingFocusField] = useState<string | null>(
    null,
  );
  const [slugMode, setSlugMode] = useState<'AUTO' | 'MANUAL'>(
    projectId ? 'MANUAL' : 'AUTO',
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<PublicGalleryProjectResponse | null>(
    null,
  );
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const busy = busyAction !== null;

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

  useEffect(() => {
    if (!pendingFocusField || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-gallery-field="${CSS.escape(pendingFocusField)}"]`,
      );
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingFocusField(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, pendingFocusField]);

  function update<K extends keyof GalleryProjectContentInput>(
    key: K,
    value: GalleryProjectContentInput[K],
  ) {
    setContent((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateTitle(value: string) {
    setContent((current) => ({
      ...current,
      title: value,
      ...(slugMode === 'AUTO' ? { slug: createGallerySlug(value) } : {}),
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.title;
      if (slugMode === 'AUTO') delete next.slug;
      return next;
    });
  }

  function focusFirstInvalid(errors: FieldErrors) {
    const keys = Object.keys(errors);
    const first =
      galleryFieldOrder.find((field) => keys.includes(field)) ?? keys[0];
    if (!first) return;
    setPendingFocusField(first);
  }

  function validateProject() {
    const nextErrors: FieldErrors = {};
    if (
      slugMode === 'AUTO' &&
      content.title.trim() &&
      !createGallerySlug(content.title)
    ) {
      nextErrors.title =
        'Enter a title containing letters or numbers so a valid URL can be created.';
      nextErrors.slug = 'A valid Gallery URL could not be generated.';
    }
    const parsed = galleryProjectContentSchema.safeParse(content);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'title');
        nextErrors[field] ??= issue.message;
      }
    }
    if (!media.length) nextErrors.media = 'Add at least one Gallery image.';
    if (media.length > GALLERY_PROJECT_MEDIA_LIMIT)
      nextErrors.media = `You can add up to ${GALLERY_PROJECT_MEDIA_LIMIT} images to a Gallery project.`;
    media.forEach((item, index) => {
      if (!item.altText.trim())
        nextErrors[`media.${index}.altText`] =
          'Add alt text describing this image.';
    });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError(
        `${Object.keys(nextErrors).length} ${Object.keys(nextErrors).length === 1 ? 'field needs' : 'fields need'} attention.`,
      );
      focusFirstInvalid(nextErrors);
      return null;
    }
    return parsed.success ? parsed.data : null;
  }

  function addMedia(item: MediaLibraryItem) {
    if (media.some((entry) => entry.mediaId === item.id)) {
      setNotice('That image is already in this project.');
      return;
    }
    if (media.length >= GALLERY_PROJECT_MEDIA_LIMIT) {
      const message = `This Gallery project can contain up to ${GALLERY_PROJECT_MEDIA_LIMIT} images.`;
      setFieldErrors((current) => ({ ...current, media: message }));
      setError(message);
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
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.media;
      return next;
    });
  }

  async function mutate(action: 'save' | 'publish' | 'unpublish' | 'archive') {
    setError('');
    setNotice('');
    setFieldErrors({});
    try {
      let url = '/api/gallery';
      let body: unknown;
      if (action === 'save' || action === 'publish') {
        const parsed = validateProject();
        if (!parsed) return;
        setBusyAction(action);
        body = {
          operationId: crypto.randomUUID(),
          ...(project ? { expectedLockVersion: project.lockVersion } : {}),
          slugMode,
          content: parsed,
          media: media.map(({ mediaId, altText, focalPoint }) => ({
            mediaId,
            altText: altText.trim(),
            focalPoint,
          })),
        };
        if (action === 'save') {
          if (project) url = `/api/gallery/${project.id}/drafts`;
        } else {
          url = project
            ? `/api/gallery/${project.id}/publish`
            : '/api/gallery/publish';
        }
      } else {
        setBusyAction(action);
        if (!project) throw new Error('Save the project before continuing.');
        body = {
          operationId: crypto.randomUUID(),
          expectedLockVersion: project.lockVersion,
        };
        if (action === 'unpublish') {
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
      if (!response.ok) {
        const message = await messageFrom(
          response,
          action === 'publish'
            ? 'Gallery project could not be published.'
            : 'The Gallery change could not be saved.',
        );
        if (/Gallery URL|slug.*already|URL.*already/i.test(message)) {
          const nextErrors = { slug: message };
          setFieldErrors(nextErrors);
          focusFirstInvalid(nextErrors);
        }
        throw new Error(message);
      }
      const result = (await response.json()) as AdminGalleryProjectResponse;
      apply(result);
      setPreview(null);
      setNotice(
        action === 'save'
          ? 'Saved'
          : action === 'publish'
            ? 'Gallery project published.'
            : action === 'unpublish'
              ? 'Gallery project unpublished. Its editable draft and publication history were preserved.'
              : 'Gallery project archived.',
      );
      if (!projectId && action === 'save')
        window.history.replaceState(null, '', `/website/gallery/${result.id}`);
      if (action === 'publish') {
        router.push('/website/gallery');
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The Gallery change could not be saved.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function showPreview() {
    const revision = project?.draft ?? project?.publishedRevision;
    if (!project || !revision) return;
    setBusyAction('preview');
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
      setBusyAction(null);
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
          <h2 className="col-span-full text-xl font-semibold">Gallery event</h2>
          <Field error={fieldErrors.title} label="Title" name="title">
            <input
              className="control"
              maxLength={180}
              onChange={(e) => updateTitle(e.target.value)}
              value={content.title}
            />
          </Field>
          <Field
            decorateControl={false}
            error={fieldErrors.slug}
            label="URL slug"
            name="slug"
          >
            <div>
              <div className="flex gap-2">
                <input
                  aria-describedby={fieldErrors.slug ? 'slug-error' : undefined}
                  aria-invalid={Boolean(fieldErrors.slug)}
                  className="control"
                  data-gallery-field="slug"
                  id="slug"
                  maxLength={160}
                  onChange={(e) => {
                    setSlugMode('MANUAL');
                    update('slug', createGallerySlug(e.target.value));
                  }}
                  placeholder="project-name"
                  value={content.slug}
                />
                {slugMode === 'MANUAL' ? (
                  <button
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold"
                    onClick={() => {
                      setSlugMode('AUTO');
                      update('slug', createGallerySlug(content.title));
                    }}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" className="h-4 w-4" />
                    Regenerate
                  </button>
                ) : null}
              </div>
              <span className="mt-1.5 block break-all text-xs font-normal text-muted-foreground">
                {publicOrigin.replace(/\/$/, '')}/gallery/
                {content.slug || 'your-project'}
              </span>
            </div>
          </Field>
          <Field
            error={fieldErrors.serviceType}
            label="Service"
            name="serviceType"
          >
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
          <Field
            error={fieldErrors.eventDate}
            label="Event date (optional)"
            name="eventDate"
          >
            <input
              className="control"
              onChange={(e) => update('eventDate', e.target.value || null)}
              type="date"
              value={content.eventDate ?? ''}
            />
          </Field>
          <Field
            error={fieldErrors.location}
            label="Location (optional)"
            name="location"
          >
            <input
              className="control"
              maxLength={240}
              onChange={(e) => update('location', e.target.value || null)}
              value={content.location ?? ''}
            />
          </Field>
          <Field
            error={fieldErrors.sortOrder}
            label="Sort order"
            name="sortOrder"
          >
            <input
              className="control"
              min={0}
              max={10000}
              onChange={(e) => update('sortOrder', Number(e.target.value))}
              type="number"
              value={content.sortOrder}
            />
          </Field>
          <Field
            error={fieldErrors.shortDescription}
            full
            label="Short description"
            name="shortDescription"
          >
            <textarea
              className="control min-h-24"
              maxLength={400}
              onChange={(e) => update('shortDescription', e.target.value)}
              value={content.shortDescription}
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
              <p className="mt-1 text-sm font-medium">
                Images {media.length} / {GALLERY_PROJECT_MEDIA_LIMIT}
              </p>
            </div>
            {canEdit ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold"
                data-gallery-field="media"
                disabled={media.length >= GALLERY_PROJECT_MEDIA_LIMIT}
                onClick={() => setPickerOpen(true)}
                ref={pickerTrigger}
                type="button"
              >
                <ImagePlus aria-hidden="true" className="h-4 w-4" /> Add image
              </button>
            ) : null}
          </div>
          {fieldErrors.media ? (
            <p
              className="text-sm text-destructive"
              id="media-error"
              role="alert"
            >
              {fieldErrors.media}
            </p>
          ) : null}
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
                    <ManagedMediaPreview sizes="160px" src={item.previewUrl} />
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
                    <Field
                      error={fieldErrors[`media.${index}.altText`]}
                      label="Alternative text"
                      name={`media.${index}.altText`}
                    >
                      <input
                        className="control"
                        maxLength={300}
                        onChange={(e) => {
                          setMedia((items) =>
                            items.map((entry) =>
                              entry.mediaId === item.mediaId
                                ? { ...entry, altText: e.target.value }
                                : entry,
                            ),
                          );
                          setFieldErrors((current) => {
                            const next = { ...current };
                            delete next[`media.${index}.altText`];
                            return next;
                          });
                        }}
                        value={item.altText}
                      />
                    </Field>
                    <Field
                      label="Focal point"
                      name={`media.${index}.focalPoint`}
                    >
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
      </fieldset>

      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        {canEdit && !project?.archivedAt ? (
          <button
            className="min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void mutate('save')}
            type="button"
          >
            {busyAction === 'save' ? 'Saving...' : 'Save Draft'}
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
        {canPublish && canEdit && !project?.archivedAt ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void mutate('publish')}
            type="button"
          >
            <Send aria-hidden="true" className="h-4 w-4" />{' '}
            {busyAction === 'publish' ? 'Publishing...' : 'Publish'}
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
                <ManagedMediaPreview
                  alt={item.altText}
                  sizes="(min-width:1024px) 30vw, 50vw"
                  src={
                    media.find((entry) => entry.url === item.url)?.previewUrl ??
                    item.url
                  }
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
        homepageOnly
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
  decorateControl = true,
  error,
  full = false,
  label,
  name,
}: {
  children: ReactElement<Record<string, unknown>>;
  decorateControl?: boolean;
  error?: string;
  full?: boolean;
  label: string;
  name: string;
}) {
  const errorId = `${name.replaceAll('.', '-')}-error`;
  const control =
    decorateControl && isValidElement(children)
      ? cloneElement(children, {
          'aria-describedby': error ? errorId : undefined,
          'aria-invalid': Boolean(error),
          'data-gallery-field': name,
          id: name.replaceAll('.', '-'),
        })
      : children;
  return (
    <label
      className={`text-sm font-medium ${error ? 'text-destructive' : ''} ${full ? 'md:col-span-2' : ''}`}
      htmlFor={name.replaceAll('.', '-')}
    >
      {label}
      <span className="mt-2 block">{control}</span>
      {error ? (
        <span className="mt-1.5 block text-sm text-destructive" id={errorId}>
          {error}
        </span>
      ) : null}
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
