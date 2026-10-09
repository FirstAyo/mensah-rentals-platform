'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MediaLibraryItem } from './media-picker-dialog';
import { MediaAssignmentField } from './media-picker-dialog';

type Item = {
  media: MediaLibraryItem;
  altText: string;
  focalPoint: 'center' | 'top' | 'bottom' | 'left' | 'right';
  isDecorative: boolean;
};

export function CategoryPresentationManager({
  canManageMedia,
  categoryId,
}: {
  canManageMedia: boolean;
  categoryId: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/catalogue/categories/${categoryId}/presentation`,
      { cache: 'no-store' },
    );
    if (!response.ok)
      throw new Error('Supporting visuals could not be loaded.');
    const data = (await response.json()) as {
      items: Array<{
        mediaRef: string;
        source: 'HOMEPAGE' | 'PRODUCT';
        url: string;
        altText: string;
        focalPoint: Item['focalPoint'];
        isDecorative: boolean;
      }>;
    };
    setItems(
      data.items.map((item) => ({
        media: {
          id: item.mediaRef.replace(/^product:/, ''),
          mediaRef: item.mediaRef,
          source: item.source,
          url: item.url,
          label: item.altText || 'Decorative category image',
          description: item.altText,
          width: null,
          height: null,
          byteSize: null,
          usageCount: 1,
          productName: null,
        },
        altText: item.altText,
        focalPoint: item.focalPoint,
        isDecorative: item.isDecorative,
      })),
    );
  }, [categoryId]);

  useEffect(() => {
    void load().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : 'Unable to load visuals.',
      ),
    );
  }, [load]);

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/catalogue/categories/${categoryId}/presentation`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map((item) => ({
              mediaRef: item.media.mediaRef,
              altText: item.isDecorative ? '' : item.altText.trim(),
              focalPoint: item.focalPoint,
              isDecorative: item.isDecorative,
            })),
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          body?.message ?? 'Supporting visuals could not be saved.',
        );
      }
      setMessage('Category supporting visuals saved.');
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Supporting visuals could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-4xl space-y-5 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-xl font-semibold">Category supporting visuals</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose up to four ordered managed images for the public category page.
        </p>
      </div>
      {items.map((item, index) => (
        <div
          className="space-y-4 rounded-xl border border-border p-4"
          key={`${item.media.mediaRef}-${index}`}
        >
          <MediaAssignmentField
            canEdit={canManageMedia}
            canUpload={canManageMedia}
            current={item.media}
            label={`Supporting visual ${index + 1}`}
            onNotice={setMessage}
            onRemove={() =>
              setItems((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            onSelect={(media) =>
              setItems((current) =>
                current.map((value, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...value,
                        media,
                        altText: media.description || media.label,
                      }
                    : value,
                ),
              )
            }
          />
          {canManageMedia && items.length > 1 ? (
            <div
              aria-label={`Reorder supporting visual ${index + 1}`}
              className="flex flex-wrap gap-2"
              role="group"
            >
              <button
                className="min-h-10 rounded-lg border border-border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                disabled={index === 0}
                onClick={() =>
                  setItems((current) => {
                    if (index === 0) return current;
                    const next = [...current];
                    [next[index - 1], next[index]] = [
                      next[index]!,
                      next[index - 1]!,
                    ];
                    return next;
                  })
                }
                type="button"
              >
                Move up
              </button>
              <button
                className="min-h-10 rounded-lg border border-border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                disabled={index === items.length - 1}
                onClick={() =>
                  setItems((current) => {
                    if (index >= current.length - 1) return current;
                    const next = [...current];
                    [next[index], next[index + 1]] = [
                      next[index + 1]!,
                      next[index]!,
                    ];
                    return next;
                  })
                }
                type="button"
              >
                Move down
              </button>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Alt text
              <input
                className="h-11 rounded-lg border border-border bg-background px-3"
                disabled={!canManageMedia || item.isDecorative}
                maxLength={300}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((value, itemIndex) =>
                      itemIndex === index
                        ? { ...value, altText: event.target.value }
                        : value,
                    ),
                  )
                }
                value={item.altText}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Focal position
              <select
                className="h-11 rounded-lg border border-border bg-background px-3"
                disabled={!canManageMedia}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((value, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...value,
                            focalPoint: event.target
                              .value as Item['focalPoint'],
                          }
                        : value,
                    ),
                  )
                }
                value={item.focalPoint}
              >
                {['center', 'top', 'bottom', 'left', 'right'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              checked={item.isDecorative}
              disabled={!canManageMedia}
              onChange={(event) =>
                setItems((current) =>
                  current.map((value, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...value,
                          isDecorative: event.target.checked,
                          altText: event.target.checked ? '' : value.altText,
                        }
                      : value,
                  ),
                )
              }
              type="checkbox"
            />{' '}
            Decorative image (empty alt text)
          </label>
        </div>
      ))}
      {canManageMedia && items.length < 4 ? (
        <MediaAssignmentField
          canEdit
          canUpload
          current={null}
          label="Add supporting visual"
          onNotice={setMessage}
          onRemove={() => undefined}
          onSelect={(media) =>
            setItems((current) => [
              ...current,
              {
                media,
                altText: media.description || media.label,
                focalPoint: 'center',
                isDecorative: false,
              },
            ])
          }
        />
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
        >
          {message}
        </p>
      ) : null}
      {canManageMedia ? (
        <button
          className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          {busy ? 'Saving…' : 'Save supporting visuals'}
        </button>
      ) : null}
    </section>
  );
}
