'use client';

import type { PublicGalleryPhotoResponse } from '@mensah-rentals/types';
import { ArrowLeft, ArrowRight, Expand, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

export function GalleryLightbox({
  photos,
}: {
  photos: PublicGalleryPhotoResponse[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const close = () => setSelected(null);
  const move = useCallback(
    (direction: -1 | 1) =>
      setSelected((current) =>
        current === null
          ? null
          : (current + direction + photos.length) % photos.length,
      ),
    [photos.length],
  );

  useEffect(() => {
    const modal = dialog.current;
    if (!modal || selected === null) return;
    if (!modal.open) modal.showModal();
    closeButton.current?.focus();
    return () => {
      if (modal.open) modal.close();
      window.setTimeout(() => returnFocus.current?.focus(), 0);
    };
  }, [selected]);

  useEffect(() => {
    if (selected === null) return;
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
  }, [move, selected]);

  const active = selected === null ? null : photos[selected];
  return (
    <>
      <ul
        aria-label="Gallery photographs"
        className="columns-2 gap-2 sm:gap-3 md:columns-3 xl:columns-4"
        data-gallery-masonry
      >
        {photos.map((photo, index) => (
          <li
            className="mb-2 inline-block w-full break-inside-avoid sm:mb-3"
            key={photo.key}
          >
            <button
              aria-label={`Open ${photo.event.title}, image ${photo.eventImageIndex} of ${photo.eventImageCount}: ${photo.image.altText}`}
              className="group relative block w-full overflow-hidden rounded-lg bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:rounded-xl"
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                setSelected(index);
              }}
              type="button"
            >
              <Image
                alt={photo.image.altText}
                className="h-auto w-full transition duration-300 group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none"
                height={photo.image.height}
                priority={index < 4}
                sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 350px"
                src={photo.image.url}
                width={photo.image.width}
              />
              <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
              <span className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 sm:inset-x-3 sm:bottom-3">
                <span className="line-clamp-2 rounded-full border border-white/20 bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold leading-4 text-white backdrop-blur sm:text-xs">
                  {photo.event.title}
                </span>
                <Expand
                  aria-hidden="true"
                  className="hidden h-4 w-4 shrink-0 text-white sm:block"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

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
            const end = event.changedTouches[0]?.clientX ?? start;
            if (Math.abs(end - start) >= 55) move(end < start ? 1 : -1);
          }}
          onTouchStart={(event) => {
            touchStart.current = event.changedTouches[0]?.clientX ?? null;
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
                aria-label="Close image viewer"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={close}
                ref={closeButton}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="relative min-h-0 bg-black/25">
              <Image
                alt={active.image.altText}
                className="object-contain"
                fill
                priority
                sizes="100vw"
                src={active.image.url}
              />
              {photos.length > 1 ? (
                <>
                  <button
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-5"
                    onClick={() => move(-1)}
                    type="button"
                  >
                    <ArrowLeft aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-5"
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
                {selected + 1} / {photos.length}
              </p>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
