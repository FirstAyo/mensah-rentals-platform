import type { Metadata } from 'next';
import { Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';

import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { ContactEnquiryForm } from '@/components/contact-enquiry-form';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import {
  companyPageJsonLd,
  contactOrganizationJsonLd,
  serializeJsonLd,
} from '@/lib/structured-data';

const description =
  'Contact Mensah Rentals & Services about equipment rentals for an event, production, or project in Richmond, British Columbia.';

export const metadata: Metadata = {
  title: 'Contact Mensah Rentals & Services',
  description,
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Mensah Rentals & Services',
    description,
    url: '/contact',
  },
  twitter: {
    card: 'summary',
    title: 'Contact Mensah Rentals & Services',
    description,
  },
  robots: publicPageRobots(),
};

export default function ContactPage() {
  const origin = siteOrigin();
  const crumbs = [{ href: '/', label: 'Home' }, { label: 'Contact' }];
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(
              origin,
              '/contact',
              'Contact Mensah Rentals & Services',
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
          __html: serializeJsonLd(breadcrumbJsonLd(crumbs, origin)),
        }}
        type="application/ld+json"
      />
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-amber-500/10">
        <div className="mx-auto max-w-[1760px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <Breadcrumbs items={crumbs} />
          <p className="mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
            Contact
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Tell us what your event, production, or project needs
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            Send a general enquiry here. If you already know the equipment and
            quantities you want, the rental catalogue is the best place to
            prepare a complete request.
          </p>
        </div>
      </section>
      <div className="mx-auto grid max-w-[1760px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[.72fr_1.28fr] lg:px-8 lg:py-20">
        <aside>
          <h2 className="text-2xl font-semibold">Contact details</h2>
          <div className="mt-6 space-y-4">
            <ContactRow
              icon={Phone}
              label="Phone"
              href="tel:+16046445265"
              value="(604) 644-5265"
            />
            <ContactRow
              icon={Mail}
              label="Email"
              href="mailto:info@mensahrentals.com"
              value="info@mensahrentals.com"
            />
            <ContactRow
              icon={MapPin}
              label="Location"
              value="Richmond, British Columbia"
            />
          </div>
          <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-5">
            <ShieldCheck aria-hidden="true" className="h-6 w-6 text-primary" />
            <h2 className="mt-3 font-semibold">A private staff workflow</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Submitted enquiries are stored for authorized staff review. The
              platform does not claim an email was delivered because an outbound
              email provider is not configured in this phase.
            </p>
          </div>
        </aside>
        <section aria-labelledby="enquiry-form-title">
          <h2 className="text-2xl font-semibold" id="enquiry-form-title">
            Send an enquiry
          </h2>
          <p className="mt-2 text-muted-foreground">
            Required fields are marked with an asterisk.
          </p>
          <div className="mt-6">
            <ContactEnquiryForm />
          </div>
        </section>
      </div>
    </>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block font-medium">{value}</span>
    </>
  );
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-card p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      {href ? (
        <a
          className="min-w-0 rounded outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          href={href}
        >
          {content}
        </a>
      ) : (
        <div>{content}</div>
      )}
    </div>
  );
}
