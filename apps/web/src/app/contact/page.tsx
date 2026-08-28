import type { Metadata } from 'next';
import { Mail, MapPin, Phone } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { breadcrumbJsonLd } from '@/components/breadcrumbs';
import { ContactEnquiryForm } from '@/components/contact-enquiry-form';
import { PublicPageHero } from '@/components/public-page-hero';
import { getPublicFeatures } from '@/lib/public-features';
import { getPublishedPublicPage } from '@/lib/public-pages';

export const dynamic = 'force-dynamic';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import {
  companyPageJsonLd,
  contactOrganizationJsonLd,
  serializeJsonLd,
} from '@/lib/structured-data';

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getPublishedPublicPage('CONTACT');
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: '/contact' },
    openGraph: {
      title: seo.socialTitle || seo.title,
      description: seo.socialDescription || seo.description,
      url: '/contact',
      images: seo.socialImage.imageUrl ? [seo.socialImage.imageUrl] : undefined,
    },
    twitter: {
      card: seo.socialImage.imageUrl ? 'summary_large_image' : 'summary',
      title: seo.socialTitle || seo.title,
      description: seo.socialDescription || seo.description,
      images: seo.socialImage.imageUrl ? [seo.socialImage.imageUrl] : undefined,
    },
    robots: publicPageRobots(),
  };
}

export default async function ContactPage() {
  const [page, features] = await Promise.all([
    getPublishedPublicPage('CONTACT'),
    getPublicFeatures(),
  ]);
  if (page.key !== 'CONTACT') throw new Error('Unexpected page content.');
  const c = page.content;
  const origin = siteOrigin();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(
              origin,
              '/contact',
              page.seo.title,
              'ContactPage',
            ),
          ),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(contactOrganizationJsonLd(origin)),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbJsonLd(
              [{ href: '/', label: 'Home' }, { label: 'Contact' }],
              origin,
            ),
          ),
        }}
        type="application/ld+json"
      />
      <PublicPageHero
        hero={c.hero}
        page="contact"
        rentalRequests={features.rentalRequests}
      />
      {c.intro.visible ? (
        <section className="mx-auto max-w-[1500px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-foreground">
              {c.intro.eyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
              {c.intro.title}
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              {c.intro.description}
            </p>
          </div>
        </section>
      ) : null}
      {c.contactCards.visible ? (
        <section className="mx-auto grid max-w-[1500px] gap-4 px-4 pb-16 sm:px-6 md:grid-cols-3 lg:px-8">
          <ContactCard
            icon={Phone}
            label={c.contactCards.phoneLabel}
            description={c.contactCards.phoneDescription}
            value="(604) 644-5265"
            href="tel:+16046445265"
          />
          <ContactCard
            icon={Mail}
            label={c.contactCards.emailLabel}
            description={c.contactCards.emailDescription}
            value="info@mensahrentals.com"
            href="mailto:info@mensahrentals.com"
          />
          <ContactCard
            icon={MapPin}
            label={c.contactCards.locationLabel}
            description={c.contactCards.locationDescription}
            value="Richmond, British Columbia"
          />
        </section>
      ) : null}
      <section className="border-y border-border bg-muted/30" id="contact-form">
        <div className="mx-auto grid max-w-[1600px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[.82fr_1.18fr] lg:px-8 lg:py-24">
          <aside>
            {c.formSupport.visible ? (
              <>
                <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-neutral-900">
                  {c.formSupport.image.imageUrl ? (
                    <Image
                      alt={c.formSupport.image.altText}
                      className="object-cover"
                      fill
                      sizes="(max-width:1024px) 100vw, 40vw"
                      src={c.formSupport.image.imageUrl}
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                </div>
                <h2 className="mt-7 text-3xl font-bold tracking-tight">
                  {c.formSupport.title}
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {c.formSupport.description}
                </p>
                <h3 className="mt-6 font-semibold">
                  {c.formSupport.guidanceTitle}
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {c.formSupport.guidance.map((item) => (
                    <li className="border-l-2 border-primary pl-3" key={item}>
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </aside>
          <div className="rounded-[2rem] border border-border bg-card p-5 shadow-xl shadow-black/5 sm:p-8">
            <h2 className="text-2xl font-bold">Send an enquiry</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Required fields are marked with an asterisk.
            </p>
            <div className="mt-7">
              <ContactEnquiryForm />
            </div>
          </div>
        </div>
      </section>
      {c.rentalHelp.visible ? (
        <section className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              {c.rentalHelp.title}
            </h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              {c.rentalHelp.description}
            </p>
          </div>
          <div className="flex flex-col gap-3 min-[380px]:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
              href={c.rentalHelp.primaryCta.href}
            >
              {c.rentalHelp.primaryCta.label}
            </Link>
            {c.rentalHelp.secondaryCta ? (
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 font-semibold"
                href={c.rentalHelp.secondaryCta.href}
              >
                {c.rentalHelp.secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      {c.faq.visible ? (
        <section className="border-t border-border bg-muted/35 py-16 lg:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-foreground">
              {c.faq.eyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
              {c.faq.title}
            </h2>
            <div className="mt-9 divide-y divide-border border-y border-border">
              {c.faq.items.map((item) => (
                <details className="group py-5" key={item.question}>
                  <summary className="cursor-pointer list-none pr-8 text-lg font-semibold marker:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function ContactCard({
  icon: Icon,
  label,
  description,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  description: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-6 text-xl font-semibold">{label}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <p className="mt-5 font-semibold text-foreground">{value}</p>
    </>
  );
  return href ? (
    <a
      className="rounded-3xl border border-border bg-card p-6 outline-none transition hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none"
      href={href}
    >
      {content}
    </a>
  ) : (
    <article className="rounded-3xl border border-border bg-card p-6">
      {content}
    </article>
  );
}
