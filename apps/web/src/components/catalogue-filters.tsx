'use client';

import type { PublicCategoryResponse } from '@mensah-rentals/types';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import type { CatalogueQueryState } from '@/lib/catalogue-query';

export function CatalogueFilters({
  basePath,
  categories,
  currentCategory,
  state,
}: {
  basePath: string;
  categories: PublicCategoryResponse[];
  currentCategory?: string;
  state: CatalogueQueryState;
}) {
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const category = String(form.get('category') ?? '');
    const target = category ? `/rentals/${category}` : '/rentals';
    const params = new URLSearchParams();
    const search = String(form.get('search') ?? '').trim();
    const sort = String(form.get('sort') ?? 'featured');
    if (search) params.set('search', search);
    if (form.get('featured') === 'true') params.set('featured', 'true');
    if (sort !== 'featured') params.set('sort', sort);
    const query = params.toString();
    router.push(query ? `${target}?${query}` : target);
  }

  const hasFilters =
    Boolean(state.search) || state.featured || state.sort !== 'featured';

  return (
    <form
      className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:p-5"
      onSubmit={submit}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        Refine catalogue
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_minmax(11rem,.55fr)_minmax(11rem,.55fr)_auto] xl:items-end">
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Search equipment
          <span className="relative block min-w-0">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              defaultValue={state.search}
              maxLength={100}
              name="search"
              placeholder="Chair, tent, lighting..."
              type="search"
            />
          </span>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Category
          <select
            className="h-11 min-w-0 w-full rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            defaultValue={currentCategory ?? ''}
            name="category"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Sort by
          <select
            className="h-11 min-w-0 w-full rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            defaultValue={state.sort}
            name="sort"
          >
            <option value="featured">Featured first</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
            <option value="newest">Newest catalogue items</option>
          </select>
        </label>
        <button
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          type="submit"
        >
          Apply filters
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
          <input
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            defaultChecked={state.featured}
            name="featured"
            type="checkbox"
            value="true"
          />
          Featured only
        </label>
        {hasFilters ? (
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => router.push(basePath)}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
            Clear filters
          </button>
        ) : null}
      </div>
    </form>
  );
}
