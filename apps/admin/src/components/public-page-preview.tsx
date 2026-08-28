'use client';

import type { PublishedPublicPageResponse } from '@mensah-rentals/types';
import { useEffect, useState } from 'react';

export function PublicPagePreview({
  pageKey,
  revisionId,
}: {
  pageKey: string;
  revisionId: string;
}) {
  const [page, setPage] = useState<PublishedPublicPageResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch(`/api/public-pages/${pageKey}/preview/${revisionId}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Preview could not be loaded.');
        setPage((await response.json()) as PublishedPublicPageResponse);
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : 'Preview could not be loaded.',
        ),
      );
  }, [pageKey, revisionId]);
  if (!page)
    return (
      <p className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
        {error || 'Loading preview…'}
      </p>
    );
  const content = page.content;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
      <section className="relative flex min-h-[25rem] items-end overflow-hidden bg-neutral-900 p-8 text-white">
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 to-black/25" />
        <div className="relative max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-300">
            {content.hero.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-bold sm:text-6xl">
            {content.hero.title}
          </h1>
          <p className="mt-4 max-w-2xl text-white/75">
            {content.hero.description}
          </p>
        </div>
      </section>
      <div className="space-y-10 p-6 sm:p-10">
        {page.key === 'ABOUT' ? (
          <>
            <h2 className="text-3xl font-bold">
              {page.content.introduction.title}
            </h2>
            <p className="max-w-3xl leading-7 text-muted-foreground">
              {page.content.introduction.body}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {page.content.audiences.items.map((item) => (
                <article
                  className="rounded-xl border border-border p-5"
                  key={item.title}
                >
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : page.key === 'CONTACT' ? (
          <>
            <h2 className="text-3xl font-bold">{page.content.intro.title}</h2>
            <p className="max-w-3xl text-muted-foreground">
              {page.content.intro.description}
            </p>
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Live contact form appears here on the published page.
            </div>
          </>
        ) : (
          <>
            {page.content.sections.map((section) => (
              <section className="border-b border-border pb-7" key={section.id}>
                <h2 className="text-2xl font-bold">{section.title}</h2>
                <p className="mt-3 whitespace-pre-line leading-7 text-muted-foreground">
                  {section.body}
                </p>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
