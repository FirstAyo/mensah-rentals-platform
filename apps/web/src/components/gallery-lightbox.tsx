'use client';

import type { PublicGalleryPhotoResponse } from '@mensah-rentals/types';
import { ArrowLeft, ArrowRight, Expand, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ContinuousRailViewport } from '@/components/continuous-rail-viewport';
import {
  GALLERY_MOBILE_AUTOPLAY_MINIMUM,
  GALLERY_TABLET_BATCH_SIZE,
  GALLERY_WIDE_BATCH_SIZE,
  distributeGalleryRows,
} from '@/lib/gallery-photo-layout';

export function GalleryLightbox({
  event,
  initialPage,
  photos: initialPhotos,
  total,
  type,
}: {
  event?: string;
  initialPage: number;
  photos: PublicGalleryPhotoResponse[];
  total: number;
  type?: string;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [visibleCount, setVisibleCount] = useState(GALLERY_WIDE_BATCH_SIZE);
  const [batchSize, setBatchSize] = useState(GALLERY_WIDE_BATCH_SIZE);
  const [nextPage, setNextPage] = useState(initialPage + 1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isOpen = selected !== null;
  const visiblePhotos = photos.slice(0, visibleCount);
  const hasMore = visiblePhotos.length < total;
  const close = () => setSelected(null);
  const move = useCallback(
    (direction: -1 | 1) =>
      setSelected((current) =>
        current === null
          ? null
          : (current + direction + visiblePhotos.length) % visiblePhotos.length,
      ),
    [visiblePhotos.length],
  );

  useEffect(() => {
    const tablet = window.matchMedia(
      '(min-width: 768px) and (max-width: 1279px)',
    );
    const update = () =>
      setBatchSize(
        tablet.matches ? GALLERY_TABLET_BATCH_SIZE : GALLERY_WIDE_BATCH_SIZE,
      );
    update();
    tablet.addEventListener('change', update);
    return () => tablet.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setPhotos(initialPhotos);
    setVisibleCount(batchSize);
    setNextPage(initialPage + 1);
    setSelected(null);
    setLoadError('');
  }, [batchSize, event, initialPage, initialPhotos, total, type]);

  useEffect(() => {
    const modal = dialog.current;
    if (!modal || !isOpen) return;
    const returnTarget = returnFocus.current;
    if (!modal.open) modal.showModal();
    closeButton.current?.focus();
    return () => {
      if (modal.open) modal.close();
      window.setTimeout(() => returnTarget?.focus(), 0);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [isOpen, move]);

  useEffect(() => {
    if (selected === null || visiblePhotos.length < 2) return;
    const indexes = [
      (selected - 1 + visiblePhotos.length) % visiblePhotos.length,
      (selected + 1) % visiblePhotos.length,
    ];
    for (const index of new Set(indexes)) {
      const preload = new window.Image();
      preload.src = visiblePhotos[index]!.image.url;
    }
  }, [selected, visiblePhotos]);

  const openPhoto = (
    photo: PublicGalleryPhotoResponse,
    target: HTMLButtonElement,
  ) => {
    const index = visiblePhotos.findIndex((item) => item.key === photo.key);
    if (index < 0) return;
    returnFocus.current = target;
    setSelected(index);
  };

  const loadMore = async () => {
    if (loading || !hasMore) return;
    const target = Math.min(total, visibleCount + batchSize);
    if (photos.length >= target) {
      setVisibleCount(target);
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      const query = new URLSearchParams({ page: String(nextPage) });
      if (event) query.set('event', event);
      if (type) query.set('type', type);
      const response = await fetch(`/api/gallery?${query.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Gallery request failed');
      const body = (await response.json()) as {
        photos?: PublicGalleryPhotoResponse[];
      };
      if (!Array.isArray(body.photos))
        throw new Error('Unsafe Gallery response');
      const known = new Set(photos.map((photo) => photo.key));
      const appended = body.photos.filter((photo) => !known.has(photo.key));
      const expanded = [...photos, ...appended];
      setPhotos(expanded);
      setVisibleCount(Math.min(target, expanded.length));
      setNextPage((current) => current + 1);
    } catch {
      setLoadError('More photos could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const active = selected === null ? null : visiblePhotos[selected];
  return (
    <>
      <DesktopGallery photos={visiblePhotos} onOpen={openPhoto} />
      <MobileGallery photos={visiblePhotos} onOpen={openPhoto} />

      {hasMore ? (
        <div className="mt-9 text-center">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-6 font-semibold shadow-sm hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
            data-gallery-load-more
            disabled={loading}
            onClick={loadMore}
            type="button"
          >
            {loading ? 'Loading photos…' : 'Load More'}
          </button>
        </div>
      ) : null}
      {loadError ? (
        <p className="mt-3 text-center text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {selected !== null && active ? (
        <dialog
          aria-label={`${active.event.title} image viewer`}
          className="m-auto h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[96rem] overflow-hidden rounded-2xl border border-white/15 bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-black/85 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)]"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={close}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (start === null) return;
            const touch = event.changedTouches[0];
            if (!touch) return;
            const horizontal = touch.clientX - start.x;
            const vertical = touch.clientY - start.y;
            if (
              Math.abs(horizontal) >= 55 &&
              Math.abs(horizontal) > Math.abs(vertical) * 1.2
            )
              move(horizontal < 0 ? 1 : -1);
          }}
          onTouchStart={(event) => {
            const touch = event.changedTouches[0];
            touchStart.current = touch
              ? { x: touch.clientX, y: touch.clientY }
              : null;
          }}
          ref={dialog}
        >
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-3 py-2 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {active.event.title}
                </p>
                <p className="truncate text-xs text-white/65">
                  {active.service.label}
                </p>
              </div>
              <button
                aria-label="Close Gallery viewer"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-white/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                onClick={close}
                ref={closeButton}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="relative min-h-0 touch-pan-y bg-black/25">
              <Image
                alt={active.image.altText}
                className="object-contain"
                fill
                priority
                sizes="100vw"
                src={active.image.url}
              />
              {visiblePhotos.length > 1 ? (
                <>
                  <button
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none sm:left-5"
                    onClick={() => move(-1)}
                    type="button"
                  >
                    <ArrowLeft aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none sm:right-5"
                    onClick={() => move(1)}
                    type="button"
                  >
                    <ArrowRight aria-hidden="true" className="h-5 w-5" />
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-white/10 px-4 py-3 text-sm sm:px-6">
              <div className="min-w-0">
                <p className="text-white/85">{active.image.altText}</p>
                <p className="mt-1 line-clamp-2 text-xs text-white/60">
                  {active.event.shortDescription}
                </p>
              </div>
              <p className="shrink-0 font-semibold" aria-live="polite">
                {selected + 1} / {visiblePhotos.length}
              </p>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

function DesktopGallery({
  onOpen,
  photos,
}: {
  onOpen: (
    photo: PublicGalleryPhotoResponse,
    target: HTMLButtonElement,
  ) => void;
  photos: PublicGalleryPhotoResponse[];
}) {
  return (
    <ul
      aria-label="Gallery photographs"
      className="hidden gap-[6px] md:block md:columns-3 xl:columns-4"
      data-gallery-masonry
    >
      {photos.map((photo, index) => (
        <li
          className="mb-[6px] inline-block w-full break-inside-avoid"
          key={photo.key}
        >
          <GalleryPhotoButton
            onOpen={onOpen}
            photo={photo}
            priority={index < 4}
            variant="masonry"
          />
        </li>
      ))}
    </ul>
  );
}

function MobileGallery({
  onOpen,
  photos,
}: {
  onOpen: (
    photo: PublicGalleryPhotoResponse,
    target: HTMLButtonElement,
  ) => void;
  photos: PublicGalleryPhotoResponse[];
}) {
  const rows = distributeGalleryRows(photos);
  const autoplay = photos.length >= GALLERY_MOBILE_AUTOPLAY_MINIMUM;
  const directions = ['left', 'right', 'left'] as const;
  const speeds = ['slow', 'gentle', 'steady'] as const;
  const animationClasses = [
    'gallery-photo-rail-left-slow',
    'gallery-photo-rail-right-gentle',
    'gallery-photo-rail-left-steady',
  ] as const;

  return (
    <div
      aria-label="Gallery photographs"
      className="space-y-[6px] overflow-hidden md:hidden"
      data-gallery-mobile-rows
    >
      {rows.map((row, rowIndex) => (
        <ContinuousRailViewport
          className="min-h-28"
          data-direction={directions[rowIndex]}
          data-gallery-mobile-row={rowIndex + 1}
          data-speed={speeds[rowIndex]}
          key={rowIndex}
        >
          <div
            className={`${autoplay ? animationClasses[rowIndex] : ''} flex w-max`}
            data-gallery-mobile-track
          >
            <MobilePhotoGroup onOpen={onOpen} photos={row} />
            {autoplay ? (
              <div
                aria-hidden="true"
                className="continuous-rail-clone flex gap-[6px] pr-[6px]"
                data-gallery-visual-clone
              >
                {row.map((photo, index) => (
                  <GalleryPhotoButton
                    key={`clone-${photo.key}-${index}`}
                    onOpen={onOpen}
                    photo={photo}
                    tabIndex={-1}
                    variant="rail"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </ContinuousRailViewport>
      ))}
    </div>
  );
}

function MobilePhotoGroup({
  onOpen,
  photos,
}: {
  onOpen: (
    photo: PublicGalleryPhotoResponse,
    target: HTMLButtonElement,
  ) => void;
  photos: PublicGalleryPhotoResponse[];
}) {
  return (
    <div className="flex gap-[6px] pr-[6px]" data-gallery-mobile-primary>
      {photos.map((photo) => (
        <GalleryPhotoButton
          key={photo.key}
          onOpen={onOpen}
          photo={photo}
          variant="rail"
        />
      ))}
    </div>
  );
}

function GalleryPhotoButton({
  onOpen,
  photo,
  priority = false,
  tabIndex,
  variant,
}: {
  onOpen: (
    photo: PublicGalleryPhotoResponse,
    target: HTMLButtonElement,
  ) => void;
  photo: PublicGalleryPhotoResponse;
  priority?: boolean;
  tabIndex?: number;
  variant: 'masonry' | 'rail';
}) {
  const rail = variant === 'rail';
  return (
    <button
      aria-label={`Open ${photo.event.title}, image ${photo.eventImageIndex} of ${photo.eventImageCount}: ${photo.image.altText}`}
      className={`group relative block shrink-0 overflow-hidden rounded-none bg-transparent text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${rail ? 'h-28 w-40' : 'w-full'}`}
      data-gallery-photo-tile
      onClick={(event) => onOpen(photo, event.currentTarget)}
      tabIndex={tabIndex}
      type="button"
    >
      <Image
        alt={photo.image.altText}
        className={`${rail ? 'object-cover' : 'h-auto w-full'} transition duration-300 group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none`}
        fill={rail}
        height={rail ? undefined : photo.image.height}
        priority={priority}
        sizes={rail ? '160px' : '(max-width: 1279px) 33vw, 350px'}
        src={photo.image.url}
        width={rail ? undefined : photo.image.width}
      />
      <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
      <span className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 sm:inset-x-3 sm:bottom-3">
        <span
          className="line-clamp-2 text-[11px] font-semibold leading-4 text-white sm:text-xs"
          data-gallery-photo-label
        >
          {photo.event.title}
        </span>
        {rail ? null : (
          <Expand
            aria-hidden="true"
            className="hidden h-4 w-4 shrink-0 text-white sm:block"
          />
        )}
      </span>
    </button>
  );
}
