import type { Metadata } from 'next';
import {
  OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT,
  OFFICIAL_CUSTOMER_FORM_TERMS,
} from '@mensah-rentals/types';

import { breadcrumbJsonLd } from '@/components/breadcrumbs';
import { LegalDocument } from '@/components/legal-document';
import { PublicPageHero } from '@/components/public-page-hero';
import { getPublishedPublicPage } from '@/lib/public-pages';

export const dynamic = 'force-dynamic';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { companyPageJsonLd, serializeJsonLd } from '@/lib/structured-data';

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getPublishedPublicPage('TERMS');
  return legalMetadata('/terms', seo);
}

export default async function TermsPage() {
  const page = await getPublishedPublicPage('TERMS');
  if (page.key !== 'TERMS' && page.key !== 'PRIVACY')
    throw new Error('Unexpected page content.');
  const origin = siteOrigin();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(origin, '/terms', page.seo.title),
          ),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbJsonLd(
              [{ href: '/', label: 'Home' }, { label: 'Terms' }],
              origin,
            ),
          ),
        }}
        type="application/ld+json"
      />
      <PublicPageHero
        compact
        hero={page.content.hero}
        meta={`Last updated: ${formatDate(page.content.lastUpdated)}`}
        page="terms"
      />
      <LegalDocument
        content={page.content}
        sectionSupplement={(id) =>
          id === 'official-form-terms' ? (
            <div className="mt-7 space-y-3">
              <div className="space-y-3">
                {OFFICIAL_CUSTOMER_FORM_TERMS.map((term) => (
                  <p
                    className="rounded-2xl border border-border bg-muted/35 p-5 leading-7"
                    key={term}
                  >
                    {term}
                  </p>
                ))}
              </div>
              <h3 className="pt-5 text-xl font-semibold">
                Official acknowledgement
              </h3>
              <p className="leading-7 text-muted-foreground">
                {OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT}
              </p>
            </div>
          ) : null
        }
      />
    </>
  );
}

function legalMetadata(
  path: string,
  seo: Awaited<ReturnType<typeof getPublishedPublicPage>>['seo'],
): Metadata {
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: path },
    openGraph: {
      title: seo.socialTitle || seo.title,
      description: seo.socialDescription || seo.description,
      url: path,
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
function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
