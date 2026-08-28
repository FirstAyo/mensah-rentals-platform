'use client';

import { ImageIcon, Search, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { adminHomepageMediaUrl } from '@/lib/homepage-media-url';
import { optimizeProductImage } from '@/lib/optimize-product-image';
import { AccessibleDialog } from './accessible-dialog';

export type MediaLibraryItem = {
  id: string;
  mediaRef: string;
  source: 'HOMEPAGE' | 'PRODUCT';
  url: string;
  label: string;
  description: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  usageCount: number;
  productName: string | null;
};

export function mediaPreviewUrl(
  item: MediaLibraryItem,
  endpoint = '/api/homepage/media',
) {
  const filename = item.url.split('/').at(-1);
  return item.source === 'PRODUCT'
    ? item.url
    : endpoint === '/api/homepage/media'
      ? adminHomepageMediaUrl({ id: item.id, url: item.url })
      : filename && /^[a-f0-9]{64}\.webp$/.test(filename)
        ? `${endpoint}/${item.id}/${filename}`
        : '';
}

export function MediaAssignmentField({
  canEdit,
  canUpload,
  current,
  endpoint = '/api/homepage/media',
  label,
  onNotice,
  onRemove,
  onSelect,
}: {
  canEdit: boolean;
  canUpload: boolean;
  current: MediaLibraryItem | null;
  endpoint?: string;
  label: string;
  onNotice: (message: string) => void;
  onRemove: () => void;
  onSelect: (item: MediaLibraryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="col-span-full space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">
            Choose an existing image or upload a new optimized image.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium"
              onClick={() => setOpen(true)}
              ref={triggerRef}
              type="button"
            >
              {current ? 'Replace image' : 'Choose image'}
            </button>
            {current ? (
              <button
                className="min-h-11 rounded-lg border border-destructive/40 px-3 text-sm text-destructive"
                onClick={onRemove}
                type="button"
              >
                Remove assignment
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {current ? (
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr] sm:items-center">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="128px"
              src={mediaPreviewUrl(current, endpoint)}
            />
          </div>
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{current.label}</p>
            <p className="text-xs text-muted-foreground">
              {current.width && current.height
                ? `${current.width} × ${current.height} · `
                : ''}
              {current.source === 'PRODUCT'
                ? `Product image${current.productName ? ` · ${current.productName}` : ''}`
                : 'Homepage media'}
            </p>
            <p className="mt-1 text-xs font-medium text-primary">
              Selected for {label}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          <ImageIcon aria-hidden="true" className="h-4 w-4" /> No image assigned
        </div>
      )}
      <MediaPickerDialog
        canUpload={canUpload}
        endpoint={endpoint}
        label={label}
        onClose={() => setOpen(false)}
        onNotice={onNotice}
        onSelect={(item) => {
          onSelect(item);
          onNotice(`Image selected for ${label}.`);
          setOpen(false);
        }}
        open={open}
        returnFocusRef={triggerRef}
      />
    </div>
  );
}

export function MediaPickerDialog({
  canUpload,
  endpoint = '/api/homepage/media',
  label,
  onClose,
  onNotice,
  onSelect,
  open,
  returnFocusRef,
}: {
  canUpload: boolean;
  endpoint?: string;
  label: string;
  onClose: () => void;
  onNotice: (message: string) => void;
  onSelect: (item: MediaLibraryItem) => void;
  open: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [source, setSource] = useState<'ALL' | 'HOMEPAGE' | 'PRODUCT'>('ALL');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '50',
          search,
          source,
        });
        const response = await fetch(`${endpoint}/library?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          setError('The media library could not be loaded.');
          return;
        }
        if (controller.signal.aborted) return;
        const body = (await response.json()) as { items: MediaLibraryItem[] };
        setItems(body.items);
        setError('');
      } catch {
        if (controller.signal.aborted) return;
        setError('The media library could not be loaded.');
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [endpoint, open, search, source]);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const optimized = await optimizeProductImage(file);
      const form = new FormData();
      form.set('file', optimized);
      form.set('description', file.name);
      const response = await fetch(endpoint, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? 'Image upload failed.');
      }
      const item = (await response.json()) as {
        id: string;
        url: string;
        description: string;
        originalFilename: string;
        width: number;
        height: number;
        byteSize: number;
      };
      setSource('HOMEPAGE');
      setSearch('');
      setItems((current) => [
        {
          id: item.id,
          mediaRef: item.id,
          source: 'HOMEPAGE',
          url: item.url,
          label: item.originalFilename,
          description: item.description,
          width: item.width,
          height: item.height,
          byteSize: item.byteSize,
          usageCount: 0,
          productName: null,
        },
        ...current.filter((entry) => entry.id !== item.id),
      ]);
      onNotice("Image uploaded. Select 'Use this image' to assign it.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Image upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessibleDialog
      descriptionId="media-picker-description"
      initialFocusRef={searchRef}
      onClose={onClose}
      open={open}
      returnFocusRef={returnFocusRef}
      titleId="media-picker-title"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="media-picker-title">
              Choose image
            </h2>
            <p
              className="mt-1 text-sm text-muted-foreground"
              id="media-picker-description"
            >
              Select an image for {label}. Source files are referenced, not
              duplicated.
            </p>
          </div>
          <button
            aria-label="Close image picker"
            className="grid h-11 w-11 place-items-center rounded-lg border border-border"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Image sources"
        >
          {(['ALL', 'HOMEPAGE', 'PRODUCT'] as const).map((value) => (
            <button
              aria-selected={source === value}
              className={`min-h-11 rounded-lg px-3 text-sm ${source === value ? 'bg-primary text-primary-foreground' : 'border border-border'}`}
              key={value}
              onClick={() => {
                if (value !== source) {
                  setItems([]);
                  setSource(value);
                }
              }}
              role="tab"
              type="button"
            >
              {value === 'ALL'
                ? 'Media library'
                : value === 'HOMEPAGE'
                  ? 'Homepage media'
                  : 'Product images'}
            </button>
          ))}
        </div>
        <label className="relative mt-3 block">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
          />
          <span className="sr-only">Search media</span>
          <input
            className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => {
              setItems([]);
              setSearch(event.target.value);
            }}
            placeholder="Search filename, label, or product name"
            ref={searchRef}
            type="search"
            value={search}
          />
        </label>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {canUpload ? (
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 text-sm font-medium">
            <Upload aria-hidden="true" className="h-4 w-4" />
            {busy ? 'Uploading…' : 'Upload new image'}
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(event) => void upload(event.target.files?.[0])}
              type="file"
            />
          </label>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <article
              className="overflow-hidden rounded-xl border border-border"
              key={`${item.source}-${item.id}`}
            >
              <div className="relative aspect-video bg-muted">
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="260px"
                  src={mediaPreviewUrl(item, endpoint)}
                />
              </div>
              <div className="space-y-2 p-3 text-sm">
                <p className="truncate font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">
                  {item.source === 'PRODUCT'
                    ? (item.productName ?? 'Product image')
                    : item.width && item.height
                      ? `${item.width} × ${item.height}`
                      : 'Homepage media'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.usageCount
                    ? `Used in ${item.usageCount} saved placement${item.usageCount === 1 ? '' : 's'}`
                    : 'Not used in saved content'}
                </p>
                <button
                  className="min-h-11 w-full rounded-lg bg-primary px-3 font-medium text-primary-foreground"
                  onClick={() => onSelect(item)}
                  type="button"
                >
                  Use this image
                </button>
              </div>
            </article>
          ))}
        </div>
        {!items.length && !error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No eligible images match this search.
          </p>
        ) : null}
      </div>
    </AccessibleDialog>
  );
}
