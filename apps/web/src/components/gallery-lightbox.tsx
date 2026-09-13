'use client';

import type { PublicGalleryMediaResponse } from '@mensah-rentals/types';
import { ArrowLeft, ArrowRight, Expand, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

export function GalleryLightbox({
  images,
  projectTitle,
}: {
  images: PublicGalleryMediaResponse[];
  projectTitle: string;
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
          : (current + direction + images.length) % images.length,
      ),
    [images.length],
  );
  const open = selected !== null;

  useEffect(() => {
    const modal = dialog.current;
    if (!modal || !open) return;
    if (!modal.open) modal.showModal();
    closeButton.current?.focus();
    return () => {
      if (modal.open) modal.close();
      window.setTimeout(() => returnFocus.current?.focus(), 0);
    };
  }, [open]);

  useEffect(() => {
    if (selected === null) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [move, selected]);

  const active = selected === null ? null : images[selected];

  return (
    <>
      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label={`${projectTitle} photographs`}
      >
        {images.map((image, index) => (
          <li
            className={index === 0 ? 'sm:col-span-2 lg:row-span-2' : ''}
            key={`${image.url}-${index}`}
          >
            <button
              aria-label={`Open image ${index + 1} of ${images.length}: ${image.altText}`}
              className="group relative block h-full min-h-56 w-full overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-64"
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                setSelected(index);
              }}
              type="button"
            >
              <Image
                alt={image.altText}
                className="object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
                fill
                sizes={
                  index === 0
                    ? '(max-width: 639px) 100vw, (max-width: 1023px) 100vw, 66vw'
                    : '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw'
                }
                src={image.url}
                style={{ objectPosition: image.focalPoint }}
              />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-2 text-xs font-semibold text-white opacity-90 backdrop-blur transition group-hover:bg-slate-950/85 motion-reduce:transition-none">
                <Expand aria-hidden="true" className="h-4 w-4" />
                View
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected !== null && active ? (
        <dialog
          aria-label={`${projectTitle} image viewer`}
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
            const distance = event.changedTouches[0]?.clientX ?? start;
            if (Math.abs(distance - start) < 55) return;
            move(distance < start ? 1 : -1);
          }}
          onTouchStart={(event) => {
            touchStart.current = event.changedTouches[0]?.clientX ?? null;
          }}
          ref={dialog}
        >
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-3 py-2 sm:px-5">
              <p className="min-w-0 truncate text-sm font-medium">
                {projectTitle}
              </p>
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
                alt={active.altText}
                className="object-contain"
                fill
                priority
                sizes="100vw"
                src={active.url}
              />
              {images.length > 1 ? (
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
              <p className="max-w-4xl text-white/80">{active.altText}</p>
              <p className="shrink-0 font-semibold" aria-live="polite">
                {selected + 1} / {images.length}
              </p>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
