'use client';

import type { PublicPageAdminDetail } from '@mensah-rentals/types';
import {
  parsePublicPageContent,
  publicPageSeoSchema,
  type PublicPageKey,
} from '@mensah-rentals/validation';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminNotifications } from './admin-notifications';
import {
  MediaAssignmentField,
  type MediaLibraryItem,
} from './media-picker-dialog';

type JsonRecord = Record<string, unknown>;
const inputClass =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export function PublicPageEditor({
  pageKey,
  canEdit,
  canPublish,
}: {
  pageKey: PublicPageKey;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const { notify } = useAdminNotifications();
  const [detail, setDetail] = useState<PublicPageAdminDetail | null>(null);
  const [content, setContent] = useState<JsonRecord>({});
  const [seo, setSeo] = useState<JsonRecord>({});
  const [media, setMedia] = useState<MediaLibraryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/public-pages/${pageKey}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Page content could not be loaded.');
    const next = (await response.json()) as PublicPageAdminDetail;
    const revision = next.draft ?? next.published;
    setDetail(next);
    setContent(structuredClone(revision.content) as JsonRecord);
    setSeo(structuredClone(revision.seo) as JsonRecord);
    setMedia(revision.media);
  }, [pageKey]);

  useEffect(() => {
    void load().catch((cause: unknown) =>
      setError(
        cause instanceof Error
          ? cause.message
          : 'Page content could not be loaded.',
      ),
    );
  }, [load]);
  const mediaByRef = useMemo(
    () => new Map(media.map((item) => [item.mediaRef, item])),
    [media],
  );

  async function mutate(url: string, method: 'PUT' | 'POST', body: JsonRecord) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? 'The page update failed.');
      }
      await load();
      notify(
        'success',
        url.endsWith('/draft')
          ? 'Page draft saved.'
          : url.endsWith('/publish')
            ? 'Page published.'
            : 'Published revision restored.',
      );
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'The page update failed.';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!detail) return;
    try {
      parsePublicPageContent(pageKey, content);
      publicPageSeoSchema.parse(seo);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Review the page fields.';
      setError(message);
      notify('error', 'Review the highlighted page content before saving.');
      return;
    }
    await mutate(`/api/public-pages/${pageKey}/draft`, 'PUT', {
      expectedLockVersion: detail.lockVersion,
      operationId: crypto.randomUUID(),
      content,
      seo,
    });
  }

  if (!detail)
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        {error || 'Loading page content…'}
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="font-semibold">
            Published revision {detail.published.version}
          </p>
          <p className="text-sm text-muted-foreground">
            {detail.draft
              ? `Draft revision ${detail.draft.version} is being edited.`
              : 'You are editing a copy of the published content.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.draft ? (
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"
              href={`/website/public-pages/${pageKey.toLowerCase()}/preview/${detail.draft.id}`}
            >
              <ExternalLink className="h-4 w-4" /> Preview
            </Link>
          ) : null}
          {canEdit ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"
              disabled={busy}
              onClick={() => void save()}
              type="button"
            >
              <Save className="h-4 w-4" /> Save draft
            </button>
          ) : null}
          {canPublish && detail.draft ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
              disabled={busy}
              onClick={() =>
                void mutate(
                  `/api/public-pages/${pageKey}/drafts/${detail.draft!.id}/publish`,
                  'POST',
                  {
                    expectedLockVersion: detail.lockVersion,
                    operationId: crypto.randomUUID(),
                  },
                )
              }
              type="button"
            >
              <Send className="h-4 w-4" /> Publish
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <EditorPanel title="Page content">
        <StructuredFields
          canEdit={canEdit}
          mediaByRef={mediaByRef}
          onMedia={(item) =>
            setMedia((items) => [
              item,
              ...items.filter((entry) => entry.mediaRef !== item.mediaRef),
            ])
          }
          root={content}
          setRoot={setContent}
        />
      </EditorPanel>
      <EditorPanel title="Search and social metadata">
        <StructuredFields
          canEdit={canEdit}
          mediaByRef={mediaByRef}
          onMedia={(item) =>
            setMedia((items) => [
              item,
              ...items.filter((entry) => entry.mediaRef !== item.mediaRef),
            ])
          }
          root={seo}
          setRoot={setSeo}
        />
      </EditorPanel>
      <EditorPanel title="Revision history">
        <div className="divide-y divide-border">
          {detail.revisions.map((revision) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 py-4"
              key={revision.id}
            >
              <div>
                <p className="font-medium">
                  Revision {revision.version} · {revision.status.toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(revision.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm"
                  href={`/website/public-pages/${pageKey.toLowerCase()}/preview/${revision.id}`}
                >
                  Preview
                </Link>
                {canPublish &&
                revision.status === 'PUBLISHED' &&
                revision.id !== detail.published.id ? (
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        `/api/public-pages/${pageKey}/revisions/${revision.id}/restore`,
                        'POST',
                        {
                          expectedLockVersion: detail.lockVersion,
                          operationId: crypto.randomUUID(),
                        },
                      )
                    }
                    type="button"
                  >
                    <RotateCcw className="h-4 w-4" /> Restore
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </EditorPanel>
    </div>
  );
}

function EditorPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StructuredFields({
  root,
  setRoot,
  ...props
}: {
  root: JsonRecord;
  setRoot: (value: JsonRecord) => void;
  canEdit: boolean;
  mediaByRef: Map<string, MediaLibraryItem>;
  onMedia: (item: MediaLibraryItem) => void;
}) {
  const setAt = (path: Array<string | number>, value: unknown) => {
    const next = structuredClone(root);
    let cursor: unknown = next;
    for (let i = 0; i < path.length - 1; i++)
      cursor = (cursor as JsonRecord)[String(path[i])];
    (cursor as JsonRecord)[String(path.at(-1))] = value;
    setRoot(next);
  };
  return (
    <div className="grid gap-5">
      <ValueEditor label="" path={[]} setAt={setAt} value={root} {...props} />
    </div>
  );
}

function ValueEditor({
  value,
  path,
  label,
  setAt,
  canEdit,
  mediaByRef,
  onMedia,
}: {
  value: unknown;
  path: Array<string | number>;
  label: string;
  setAt: (path: Array<string | number>, value: unknown) => void;
  canEdit: boolean;
  mediaByRef: Map<string, MediaLibraryItem>;
  onMedia: (item: MediaLibraryItem) => void;
}) {
  if (isMedia(value)) {
    const current = value.mediaRef
      ? (mediaByRef.get(value.mediaRef) ?? null)
      : null;
    return (
      <div className="space-y-3">
        <MediaAssignmentField
          canEdit={canEdit}
          canUpload={canEdit}
          current={current}
          endpoint="/api/public-pages/media"
          label={pretty(label || 'Image')}
          onNotice={() => undefined}
          onRemove={() => setAt(path, { ...value, mediaRef: null })}
          onSelect={(item) => {
            onMedia(item);
            setAt(path, {
              ...value,
              mediaRef: item.mediaRef,
              altText: value.altText || item.description,
            });
          }}
        />
        <label className="grid gap-2 text-sm font-medium">
          Alternative text
          <input
            className={inputClass}
            disabled={!canEdit}
            onChange={(event) =>
              setAt(path, { ...value, altText: event.target.value })
            }
            value={value.altText}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Image focus
          <select
            className={inputClass}
            disabled={!canEdit}
            onChange={(event) =>
              setAt(path, { ...value, focalPoint: event.target.value })
            }
            value={value.focalPoint}
          >
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
    );
  }
  if (Array.isArray(value))
    return (
      <fieldset className="rounded-xl border border-border p-4">
        <legend className="px-2 font-semibold">{pretty(label)}</legend>
        <div className="space-y-4">
          {value.map((item, index) => (
            <div
              className="rounded-xl border border-border bg-muted/20 p-4"
              key={index}
            >
              <div className="mb-3 flex justify-end gap-1">
                <IconButton
                  label="Move up"
                  disabled={!canEdit || index === 0}
                  onClick={() => setAt(path, swap(value, index, index - 1))}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={!canEdit || index === value.length - 1}
                  onClick={() => setAt(path, swap(value, index, index + 1))}
                >
                  <ArrowDown />
                </IconButton>
                <IconButton
                  label="Remove"
                  disabled={!canEdit || value.length === 1}
                  onClick={() =>
                    setAt(
                      path,
                      value.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 />
                </IconButton>
              </div>
              <ValueEditor
                canEdit={canEdit}
                label={`${pretty(label)} ${index + 1}`}
                mediaByRef={mediaByRef}
                onMedia={onMedia}
                path={[...path, index]}
                setAt={setAt}
                value={item}
              />
            </div>
          ))}
          {canEdit && value.length ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
              onClick={() =>
                setAt(path, [...value, structuredClone(value.at(-1))])
              }
              type="button"
            >
              <Plus className="h-4 w-4" /> Add item
            </button>
          ) : null}
        </div>
      </fieldset>
    );
  if (value && typeof value === 'object')
    return (
      <fieldset className={label ? 'rounded-xl border border-border p-4' : ''}>
        <legend className={label ? 'px-2 font-semibold' : 'sr-only'}>
          {pretty(label || 'Fields')}
        </legend>
        <div className="grid gap-5 md:grid-cols-2">
          {Object.entries(value).map(([key, nested]) => (
            <ValueEditor
              canEdit={canEdit}
              key={key}
              label={key}
              mediaByRef={mediaByRef}
              onMedia={onMedia}
              path={[...path, key]}
              setAt={setAt}
              value={nested}
            />
          ))}
        </div>
      </fieldset>
    );
  if (typeof value === 'boolean')
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm font-medium">
        <input
          checked={value}
          disabled={!canEdit}
          onChange={(event) => setAt(path, event.target.checked)}
          type="checkbox"
        />{' '}
        Show {pretty(label)}
      </label>
    );
  const text = String(value ?? '');
  const multiline =
    text.length > 120 || /description|body|notice|answer/i.test(label);
  return (
    <label
      className={`grid gap-2 text-sm font-medium ${multiline ? 'md:col-span-2' : ''}`}
    >
      {pretty(label)}
      {multiline ? (
        <textarea
          className={`${inputClass} min-h-28 py-3`}
          disabled={!canEdit}
          onChange={(event) => setAt(path, event.target.value)}
          value={text}
        />
      ) : (
        <input
          className={inputClass}
          disabled={!canEdit}
          onChange={(event) => setAt(path, event.target.value)}
          type={label === 'lastUpdated' ? 'date' : 'text'}
          value={text}
        />
      )}
    </label>
  );
}

function isMedia(
  value: unknown,
): value is { mediaRef: string | null; altText: string; focalPoint: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'mediaRef' in value &&
      'altText' in value &&
      'focalPoint' in value,
  );
}
function pretty(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (character) => character.toUpperCase())
    .trim();
}
function swap<T>(items: T[], from: number, to: number) {
  const next = [...items];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-border disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
