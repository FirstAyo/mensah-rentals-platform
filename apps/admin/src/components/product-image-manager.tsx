'use client';

import type { AdminProductImageResponse } from '@mensah-rentals/types';
import { PRODUCT_IMAGE_LIMITS } from '@mensah-rentals/validation';
import { ImageIcon, LoaderCircle, Trash2, Upload } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import { optimizeProductImage } from '@/lib/optimize-product-image';

function formatBytes(value: number) {
  return `${(value / 1024).toFixed(value >= 1024 * 1024 ? 0 : 1)} ${
    value >= 1024 * 1024 ? 'MB' : 'KB'
  }`;
}

function ImageRow({
  image,
  productId,
  refresh,
}: {
  image: AdminProductImageResponse;
  productId: string;
  refresh: () => Promise<unknown>;
}) {
  const [altText, setAltText] = useState(image.altText);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function mutate(method: 'PUT' | 'DELETE', primary = image.isPrimary) {
    if (method === 'DELETE' && !window.confirm('Remove this product image?'))
      return;
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/catalogue/products/${productId}/images/${image.id}`,
      {
        method,
        headers: method === 'PUT' ? { 'Content-Type': 'application/json' } : {},
        body:
          method === 'PUT'
            ? JSON.stringify({ altText, isPrimary: primary })
            : undefined,
      },
    );
    setBusy(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(body?.message ?? 'Unable to update this image.');
      return;
    }
    await refresh();
  }
  return (
    <li className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-[8rem_1fr_auto]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        <Image alt={image.altText} fill sizes="128px" src={image.url} />
      </div>
      <div className="space-y-2">
        <label
          className="block text-sm font-medium"
          htmlFor={`alt-${image.id}`}
        >
          Alt text
        </label>
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
          id={`alt-${image.id}`}
          maxLength={300}
          onChange={(event) => setAltText(event.target.value)}
          value={altText}
        />
        <p className="text-xs text-muted-foreground">
          {image.isPrimary ? 'Primary catalogue image' : 'Additional image'}
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="flex flex-row gap-2 sm:flex-col">
        <button
          className="rounded-lg border border-border px-3 py-2 text-sm"
          disabled={busy}
          onClick={() => void mutate('PUT')}
          type="button"
        >
          Save alt text
        </button>
        {!image.isPrimary ? (
          <button
            className="rounded-lg border border-border px-3 py-2 text-sm"
            disabled={busy}
            onClick={() => void mutate('PUT', true)}
            type="button"
          >
            Make primary
          </button>
        ) : null}
        <button
          aria-label={`Remove ${image.altText}`}
          className="inline-flex items-center justify-center rounded-lg border border-destructive/40 p-2 text-destructive"
          disabled={busy}
          onClick={() => void mutate('DELETE')}
          type="button"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export function ProductImageManager({
  images,
  productId,
  refresh,
}: {
  images: AdminProductImageResponse[];
  productId: string;
  refresh: () => Promise<unknown>;
}) {
  const [altText, setAltText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'processing' | 'uploading'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  async function select(source?: File) {
    if (!source) return;
    setError(null);
    setOriginal({ name: source.name, size: source.size });
    setState('processing');
    try {
      const processed = await optimizeProductImage(source);
      if (preview) URL.revokeObjectURL(preview);
      setFile(processed);
      setPreview(URL.createObjectURL(processed));
    } catch (cause) {
      setFile(null);
      setError(
        cause instanceof Error ? cause.message : 'Unable to process image.',
      );
    } finally {
      setState('idle');
    }
  }
  async function upload() {
    if (!file || !altText.trim()) {
      setError('Choose an image and enter descriptive alt text.');
      return;
    }
    setState('uploading');
    setError(null);
    const body = new FormData();
    body.set('file', file);
    body.set('altText', altText.trim());
    const response = await fetch(
      `/api/catalogue/products/${productId}/images`,
      {
        method: 'POST',
        body,
      },
    );
    setState('idle');
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(result?.message ?? 'Unable to upload this image.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setOriginal(null);
    setAltText('');
    await refresh();
  }
  const atLimit = images.length >= PRODUCT_IMAGE_LIMITS.maxImages;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <ImageIcon aria-hidden="true" className="h-5 w-5" /> Product images
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to four JPEG, PNG, or WebP images. Images are optimized to WebP and
          a maximum 2400-pixel longest side before upload, then verified again
          by the server.
        </p>
      </div>
      {images.length ? (
        <ul className="space-y-3">
          {images.map((image) => (
            <ImageRow
              image={image}
              key={image.id}
              productId={productId}
              refresh={refresh}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">
          No images have been uploaded.
        </p>
      )}
      {!atLimit ? (
        <div className="grid gap-4 rounded-xl bg-muted/50 p-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Choose image</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm"
              onChange={(event) => void select(event.target.files?.[0])}
              type="file"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Descriptive alt text</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              maxLength={300}
              onChange={(event) => setAltText(event.target.value)}
              value={altText}
            />
          </label>
          {preview && file ? (
            <div className="flex gap-4 md:col-span-2">
              <div className="relative h-24 w-32 overflow-hidden rounded-lg bg-muted">
                <Image
                  alt="Processed upload preview"
                  fill
                  sizes="128px"
                  src={preview}
                />
              </div>
              <div className="text-sm">
                <p>Original: {original?.name}</p>
                <p>Original size: {formatBytes(original?.size ?? 0)}</p>
                <p>Optimized size: {formatBytes(file.size)}</p>
              </div>
            </div>
          ) : null}
          {state === 'processing' ? (
            <p className="flex items-center gap-2 text-sm md:col-span-2">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Processing
              image…
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive md:col-span-2">{error}</p>
          ) : null}
          <button
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50 md:col-span-2"
            disabled={!file || state !== 'idle'}
            onClick={() => void upload()}
            type="button"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            {state === 'uploading' ? 'Uploading…' : 'Upload optimized image'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Four-image limit reached.
        </p>
      )}
    </section>
  );
}
