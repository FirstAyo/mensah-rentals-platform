'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MediaLibraryItem } from './media-picker-dialog';
import { MediaAssignmentField } from './media-picker-dialog';

type CoverResponse = {
  cover: null | {
    mediaRef: string;
    url: string;
    altText: string;
    focalPoint: 'center' | 'top' | 'bottom' | 'left' | 'right';
    source: 'HOMEPAGE' | 'PRODUCT';
  };
  resolved: {
    url: string | null;
    altText: string;
    focalPoint: string;
    source: string;
  };
};

export function CategoryCoverManager({
  canManageMedia,
  categoryId,
}: {
  canManageMedia: boolean;
  categoryId: string;
}) {
  const [data, setData] = useState<CoverResponse | null>(null);
  const [selected, setSelected] = useState<MediaLibraryItem | null>(null);
  const [altText, setAltText] = useState('');
  const [focalPoint, setFocalPoint] = useState<
    'center' | 'top' | 'bottom' | 'left' | 'right'
  >('center');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/catalogue/categories/${categoryId}/cover-image`,
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error('Category cover could not be loaded.');
    const result = (await response.json()) as CoverResponse;
    setData(result);
    if (result.cover) {
      setSelected({
        id: result.cover.mediaRef.replace(/^product:/, ''),
        mediaRef: result.cover.mediaRef,
        source: result.cover.source,
        url: result.cover.url,
        label: result.cover.altText,
        description: result.cover.altText,
        width: null,
        height: null,
        byteSize: null,
        usageCount: 1,
        productName: null,
      });
      setAltText(result.cover.altText);
      setFocalPoint(result.cover.focalPoint);
    } else {
      setSelected(null);
      setAltText('');
      setFocalPoint('center');
    }
  }, [categoryId]);

  useEffect(() => {
    void load().catch((cause) =>
      setMessage(
        cause instanceof Error ? cause.message : 'Unable to load cover.',
      ),
    );
  }, [load]);

  async function save() {
    if (!selected || !altText.trim()) {
      setMessage('Choose an image and add descriptive alt text.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/catalogue/categories/${categoryId}/cover-image`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaRef: selected.mediaRef,
            altText: altText.trim(),
            focalPoint,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? 'Category cover could not be saved.');
      }
      setMessage('Category cover saved.');
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Category cover could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/catalogue/categories/${categoryId}/cover-image`,
        { method: 'DELETE' },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).message ??
            'Category cover could not be removed.',
        );
      setMessage(
        'Category cover removed. Product or neutral fallback will be used.',
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Category cover could not be removed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-4xl space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-xl font-semibold">Category cover image</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Featured cards use a homepage override first, then this cover, then an
          active product image, then neutral artwork.
        </p>
      </div>
      <MediaAssignmentField
        canEdit={canManageMedia}
        canUpload={canManageMedia}
        current={selected}
        label="Category cover"
        onNotice={setMessage}
        onRemove={() => void remove()}
        onSelect={(item) => {
          setSelected(item);
          setAltText(item.description || item.label);
        }}
      />
      {selected ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Alt text
            <input
              className="h-11 rounded-lg border border-border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!canManageMedia}
              maxLength={300}
              onChange={(event) => setAltText(event.target.value)}
              value={altText}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Focal position
            <select
              className="h-11 rounded-lg border border-border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!canManageMedia}
              onChange={(event) =>
                setFocalPoint(event.target.value as typeof focalPoint)
              }
              value={focalPoint}
            >
              {['center', 'top', 'bottom', 'left', 'right'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {data ? (
        <p className="text-xs text-muted-foreground">
          Current resolved source:{' '}
          {data.resolved.source.replaceAll('_', ' ').toLowerCase()}
        </p>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
        >
          {message}
        </p>
      ) : null}
      {canManageMedia && selected ? (
        <button
          className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          {busy ? 'Saving…' : 'Save category cover'}
        </button>
      ) : null}
    </section>
  );
}
