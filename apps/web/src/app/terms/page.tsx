import type { Metadata } from 'next';
import {
  OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT,
  OFFICIAL_CUSTOMER_FORM_TERMS,
} from '@mensah-rentals/types';
import Link from 'next/link';

import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { companyPageJsonLd, serializeJsonLd } from '@/lib/structured-data';

const description =
  'Terms for using the Mensah Rentals rental-request website, plus the controlled customer rental terms used on official order and return forms.';

export const metadata: Metadata = {
  title: 'Website and Rental Terms',
  description,
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Website and Rental Terms | Mensah Rentals',
    description,
    url: '/terms',
  },
  twitter: {
    card: 'summary',
    title: 'Website and Rental Terms | Mensah Rentals',
    description,
  },
  robots: publicPageRobots(),
};

export default function TermsPage() {
  const origin = siteOrigin();
  const crumbs = [{ href: '/', label: 'Home' }, { label: 'Terms' }];
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(origin, '/terms', 'Website and Rental Terms'),
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
      <section className="border-b border-border bg-muted/35">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
          <Breadcrumbs items={crumbs} />
          <p className="mt-9 text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
            Legal information
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Website and rental terms
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: August 28, 2026
          </p>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            These terms explain the website workflow and reproduce the
            controlled rental terms used on official Mensah Rentals customer
            forms. They should be reviewed by Mensah Rentals and qualified legal
            counsel before production launch.
          </p>
        </div>
      </section>
      <article className="prose prose-slate mx-auto max-w-5xl px-4 py-12 prose-headings:scroll-mt-24 dark:prose-invert sm:px-6 lg:py-16">
        <h2>1. Website purpose</h2>
        <p>
          This website is a rental-request platform, not an automatic-price
          ecommerce checkout. Browsing equipment, adding equipment to a cart,
          submitting a request, or sending a contact enquiry does not confirm
          inventory availability, reserve equipment, establish a final price, or
          create a confirmed rental order.
        </p>
        <h2>2. Rental request and quote workflow</h2>
        <p>
          Mensah Rentals reviews submitted requirements privately. Authorized
          staff may approve, partially approve, or reject requested quantities
          and may prepare a custom quote. A confirmed rental order is created
          only through the applicable acceptance and confirmation workflow.
        </p>
        <h2>3. Information you submit</h2>
        <p>
          You are responsible for providing accurate contact, event or project,
          date, fulfilment, and requested-equipment information. Do not submit
          unlawful content, malicious code, passwords, payment-card information,
          or confidential information that is not needed for the enquiry or
          rental workflow.
        </p>
        <h2>4. Acceptable use and access controls</h2>
        <p>
          Do not disrupt the service, submit abusive automated traffic, attempt
          to bypass private capabilities or staff authorization, probe another
          customer&apos;s data, or misuse third-party content. A reference
          number, name, email address, or event name does not by itself
          authorize access to private rental information.
        </p>
        <h2>5. Third-party content</h2>
        <p>
          Google Maps ratings, reviews, attribution, and source links are
          supplied by Google. Their display and use are also subject to the{' '}
          <a
            href="https://policies.google.com/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Terms of Service
          </a>{' '}
          and applicable{' '}
          <a
            href="https://developers.google.com/maps/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Maps Platform terms
          </a>
          .
        </p>
        <h2>6. Controlled official customer-form terms</h2>
        <p>
          The following eight clauses are the controlled terms reproduced on the
          official Order Form and Return Form. Their references to charges are
          retained because they are part of the supplied authoritative form;
          this public website does not invent or calculate a customer-specific
          price.
        </p>
        <div className="not-prose mt-6 space-y-3">
          {OFFICIAL_CUSTOMER_FORM_TERMS.map((term) => (
            <p
              className="rounded-2xl border border-border bg-card p-5 leading-7"
              key={term}
            >
              {term}
            </p>
          ))}
        </div>
        <h3>Official acknowledgement</h3>
        <p>{OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT}</p>
        <h2>7. Rental-specific documents</h2>
        <p>
          A quote, confirmed rental order, official Order Form, Return Form, or
          other customer document may contain additional terms or
          project-specific details. Those confirmed documents remain separate
          from these general website terms and should be read carefully.
        </p>
        <h2>8. Contact</h2>
        <p>
          Questions about these terms can be sent through the{' '}
          <Link href="/contact">contact page</Link>, by email to{' '}
          <a href="mailto:info@mensahrentals.com">info@mensahrentals.com</a>, or
          by phone at <a href="tel:+16046445265">(604) 644-5265</a>.
        </p>
      </article>
    </>
  );
}
