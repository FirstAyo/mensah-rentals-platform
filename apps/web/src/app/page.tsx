import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Film,
  Search,
  Sparkles,
  TentTree,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { listCategories, listProducts } from '@/lib/public-catalogue';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [categoryResult, productResult] = await Promise.allSettled([
    listCategories('?page=1&pageSize=6'),
    listProducts('?page=1&pageSize=4&sort=featured'),
  ]);
  const categories =
    categoryResult.status === 'fulfilled' ? categoryResult.value.items : [];
  const products =
    productResult.status === 'fulfilled' ? productResult.value.items : [];

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_12%,hsl(var(--primary)/.18),transparent_34%),radial-gradient(circle_at_12%_90%,hsl(var(--accent)/.7),transparent_34%)]" />
        <div className="mx-auto grid max-w-[1760px] gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary shadow-sm backdrop-blur">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              Equipment rental requests
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-[-0.035em] sm:text-6xl lg:text-7xl lg:leading-[1.02]">
              Equip your next production, event, or project with confidence.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Browse the catalogue, identify what your project needs, and let
              our team review the details before preparing a custom quote.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground shadow-sm outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href="/rentals"
              >
                Explore rental equipment
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                className="inline-flex min-h-12 items-center rounded-lg border border-border bg-card px-5 font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href="#how-it-works"
              >
                See how requests work
              </Link>
            </div>
            <p className="mt-5 flex max-w-2xl items-start gap-2 text-sm leading-6 text-muted-foreground">
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              />
              Catalogue browsing is public. Pricing and supply decisions are
              confirmed by the Mensah Rentals team, not calculated at checkout.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {[
              {
                icon: TentTree,
                title: 'Events',
                text: 'Practical equipment options for planned experiences and gatherings.',
              },
              {
                icon: Film,
                title: 'Productions',
                text: 'Catalogue support for film, media, and production environments.',
              },
              {
                icon: Wrench,
                title: 'Projects',
                text: 'Flexible equipment requests for temporary operational needs.',
              },
            ].map((item, index) => (
              <article
                className={`rounded-3xl border border-border bg-card/90 p-6 shadow-lg backdrop-blur ${index === 2 ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : ''}`}
                key={item.title}
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <item.icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-xl font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {categories.length ? (
        <section className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                Browse by category
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Find the right starting point
              </h2>
            </div>
            <Link
              className="inline-flex items-center gap-2 self-start rounded-lg font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
              href="/rentals"
            >
              View full catalogue
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <Link
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={`/rentals/${category.slug}`}
                key={category.slug}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Category {String(index + 1).padStart(2, '0')}
                </span>
                <span className="mt-4 flex items-center justify-between gap-4 text-xl font-semibold">
                  {category.name}
                  <ArrowRight
                    aria-hidden="true"
                    className="h-5 w-5 text-primary transition group-hover:translate-x-1"
                  />
                </span>
                {category.description ? (
                  <span className="mt-3 block text-sm leading-6 text-muted-foreground">
                    {category.description}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {products.length ? (
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              Catalogue highlights
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Equipment to explore
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section
        className="mx-auto max-w-[1760px] scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
        id="how-it-works"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            A reviewed rental process
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Browse first. Confirm with people who understand the equipment.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Mensah Rentals is a request-based service. The catalogue helps you
            plan without publishing private stock levels or automatic prices.
          </p>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Search,
              title: 'Explore the catalogue',
              text: 'Search and filter descriptive equipment information for your project.',
            },
            {
              icon: ClipboardCheck,
              title: 'Prepare your requirements',
              text: 'Note the items, quantities, dates, and project details you want reviewed.',
            },
            {
              icon: CheckCircle2,
              title: 'Receive a reviewed quote',
              text: 'Authorized staff confirm what can be supplied and prepare custom pricing.',
            },
          ].map((step, index) => (
            <li
              className="relative rounded-2xl border border-border bg-card p-6"
              key={step.title}
            >
              <span className="absolute right-5 top-4 text-5xl font-bold text-muted">
                {index + 1}
              </span>
              <step.icon aria-hidden="true" className="h-6 w-6 text-primary" />
              <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
