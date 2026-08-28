import type { Metadata } from 'next';

import { breadcrumbJsonLd } from '@/components/breadcrumbs';
import { LegalDocument } from '@/components/legal-document';
import { PublicPageHero } from '@/components/public-page-hero';
import { getPublishedPublicPage } from '@/lib/public-pages';

export const dynamic = 'force-dynamic';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { companyPageJsonLd, serializeJsonLd } from '@/lib/structured-data';

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getPublishedPublicPage('PRIVACY');
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: '/privacy' },
    openGraph: {
      title: seo.socialTitle || seo.title,
      description: seo.socialDescription || seo.description,
      url: '/privacy',
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

export default async function PrivacyPage() {
  const page = await getPublishedPublicPage('PRIVACY');
  if (page.key !== 'TERMS' && page.key !== 'PRIVACY')
    throw new Error('Unexpected page content.');
  const origin = siteOrigin();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(origin, '/privacy', page.seo.title),
          ),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbJsonLd(
              [{ href: '/', label: 'Home' }, { label: 'Privacy' }],
              origin,
            ),
          ),
        }}
        type="application/ld+json"
      />
      <PublicPageHero
        compact
        hero={page.content.hero}
        meta={`Last updated: ${new Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${page.content.lastUpdated}T00:00:00Z`))}`}
        page="privacy"
      />
      <LegalDocument content={page.content} />
    </>
  );
}
