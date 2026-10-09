'use client';

import type { PublicCategoryShowcaseItem } from '@mensah-rentals/types';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';

export function CategoryShowcase({
  categories,
  description,
  eyebrow,
  heading,
  id,
}: {
  categories: PublicCategoryShowcaseItem[];
  description: string;
  eyebrow: string;
  heading: string;
  id?: string;
}) {
  const rail = useRef<HTMLUListElement>(null);

  function move(direction: -1 | 1) {
    const list = rail.current;
    if (!list) return;
    const cards = Array.from(list.children) as HTMLElement[];
    if (!cards.length) return;
    const left = list.scrollLeft;
    const current = cards.findIndex((card) => card.offsetLeft >= left - 8);
    const next =
      direction === 1
        ? current >= cards.length - 1
          ? 0
          : current + 1
        : current <= 0
          ? cards.length - 1
          : current - 1;
    cards[next]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }

  return (
    <section
      className="border-b border-border py-14 lg:py-20"
      data-homepage-section="featured-categories"
      id={id}
    >
      <div className="public-container">
        <div className="flex items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {heading}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
              {description}
            </p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button
              aria-label="Previous category"
              className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              onClick={() => move(-1)}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              aria-label="Next category"
              className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              onClick={() => move(1)}
              type="button"
            >
              <ArrowRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>
        <ul
          ref={rail}
          className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:-mx-0 sm:px-0 lg:gap-5"
        >
          {categories.map((category) => {
            const images = [
              category.image,
              ...category.products.map((product) => ({
                ...product.image,
                focalPoint: 'center' as const,
                isDecorative: false,
              })),
            ]
              .filter((image): image is NonNullable<typeof image> =>
                Boolean(image),
              )
              .filter(
                (image, index, all) =>
                  all.findIndex((candidate) => candidate.url === image.url) ===
                  index,
              )
              .slice(0, 4);
            return (
              <li
                className="w-[86vw] max-w-[31rem] shrink-0 snap-start sm:w-[30rem] lg:w-[calc((100%-2.5rem)/3)] xl:w-[calc((100%-3.75rem)/4)]"
                key={category.slug}
              >
                <Link
                  className="group block h-full overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-sm outline-none transition hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
                  href={`/rentals/${category.slug}`}
                >
                  <div className="grid aspect-[4/3] grid-cols-3 grid-rows-2 gap-1 bg-muted p-1">
                    {images.length ? (
                      images.map((image, index) => (
                        <div
                          className={
                            index === 0
                              ? 'relative col-span-2 row-span-2 overflow-hidden rounded-l-[1.15rem]'
                              : 'relative overflow-hidden last:rounded-br-[1.15rem] first:rounded-tr-[1.15rem]'
                          }
                          key={`${image.url}-${index}`}
                        >
                          <Image
                            alt={image.isDecorative ? '' : image.altText}
                            className="object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none"
                            fill
                            sizes="(max-width: 640px) 80vw, (max-width: 1280px) 30vw, 22vw"
                            src={image.url}
                            style={{ objectPosition: image.focalPoint }}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="col-span-3 row-span-2 grid place-items-center bg-gradient-to-br from-primary/20 to-muted text-5xl font-bold text-primary/50">
                        {category.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-xl font-semibold tracking-tight">
                      {category.name}
                    </h3>
                    {category.description ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {category.description}
                      </p>
                    ) : null}
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      Explore category{' '}
                      <ArrowRight
                        aria-hidden="true"
                        className="h-4 w-4 transition group-hover:translate-x-1 motion-reduce:transform-none"
                      />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-center gap-2 sm:hidden">
          <button
            aria-label="Previous category"
            className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => move(-1)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            aria-label="Next category"
            className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => move(1)}
            type="button"
          >
            <ArrowRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
