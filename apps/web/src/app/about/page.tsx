import type { Metadata } from 'next';
import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  ClipboardCheck,
  PackageSearch,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { getPublicFeatures } from '@/lib/public-features';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { companyPageJsonLd, serializeJsonLd } from '@/lib/structured-data';

const description =
  'Learn how Mensah Rentals & Services supports events, film productions, and projects through a reviewed rental-request and custom-quote process.';

export const metadata: Metadata = {
  title: 'About Mensah Rentals & Services',
  description,
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Mensah Rentals & Services',
    description,
    url: '/about',
  },
  twitter: {
    card: 'summary',
    title: 'About Mensah Rentals & Services',
    description,
  },
  robots: publicPageRobots(),
};

const principles = [
  {
    icon: ClipboardCheck,
    title: 'Reviewed requests',
    text: 'Every equipment request is reviewed by the team before quantities, availability, or a custom quote are confirmed.',
  },
  {
    icon: Users,
    title: 'Human support',
    text: 'Customers can describe the event, production, or project so staff can respond to the actual requirements.',
  },
  {
    icon: BadgeCheck,
    title: 'Clear workflow',
    text: 'A request, quote, confirmed order, fulfilment, and return remain distinct steps with an accountable operational record.',
  },
];

const requestSteps = [
  {
    icon: PackageSearch,
    text: 'Explore public equipment details without public stock counts.',
    title: 'Browse',
  },
  {
    icon: Clapperboard,
    text: 'Share the event, production, dates, and desired quantities.',
    title: 'Describe',
  },
  {
    icon: Sparkles,
    text: 'Staff review the request before a custom quote or confirmed order.',
    title: 'Review',
  },
];

export default async function AboutPage() {
  const [features, origin] = await Promise.all([
    getPublicFeatures(),
    Promise.resolve(siteOrigin()),
  ]);
  const crumbs = [{ href: '/', label: 'Home' }, { label: 'About' }];
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(
              origin,
              '/about',
              'About Mensah Rentals & Services',
              'AboutPage',
            ),
          ),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbJsonLd(crumbs, origin)),
        }}
        type="application/ld+json"
      />
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-amber-500/10">
        <div className="mx-auto max-w-[1760px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
          <Breadcrumbs items={crumbs} />
          <div className="mt-10 grid items-end gap-10 lg:grid-cols-[1.15fr_.85fr]">
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
                About us
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Equipment support built around the details of your project
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Mensah Rentals &amp; Services Inc. provides equipment rental
                support for events, film productions, and other projects.
                Customers tell us what they need; our team reviews the request
                and prepares a custom response.
              </p>
              <div className="mt-8 flex flex-col gap-3 min-[380px]:flex-row">
                <Link
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                  href="/rentals"
                >
                  Browse equipment{' '}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-5 font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  href="/contact"
                >
                  Contact our team
                </Link>
              </div>
              {!features.rentalRequests ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  The catalogue remains available while online rental requests
                  are temporarily unavailable.
                </p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {requestSteps.map(({ icon: Icon, text, title }) => (
                <div
                  className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm"
                  key={title}
                >
                  <Icon aria-hidden="true" className="h-6 w-6 text-primary" />
                  <p className="mt-3 font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
            How we work
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            A rental-request service, not an automatic checkout
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            The website helps customers prepare a complete equipment request. It
            does not publish inventory quantities or automatically calculate a
            final price. Those operational details are reviewed privately by
            authorized staff.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {principles.map(({ icon: Icon, text, title }) => (
            <article
              className="rounded-3xl border border-border bg-card p-6"
              key={title}
            >
              <Icon aria-hidden="true" className="h-7 w-7 text-primary" />
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
