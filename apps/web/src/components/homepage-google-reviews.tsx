import type {
  PublicGoogleReview,
  PublicHomepageContent,
} from '@mensah-rentals/validation';
import { ExternalLink, Flag, Star } from 'lucide-react';

import { getPublicGoogleReviews } from '@/lib/public-google-reviews';

type ReviewSection = PublicHomepageContent['reviews'];
type GoogleLinks = { reviewsUrl: string | null; writeReviewUrl: string | null };

const externalLink =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export async function HomepageGoogleReviews({
  section,
  links,
}: {
  section: ReviewSection;
  links: GoogleLinks;
}) {
  const response = await getPublicGoogleReviews();
  if (response.status !== 'LIVE')
    return <HomepageGoogleReviewsFallback links={links} section={section} />;
  const reviewsUrl =
    links.reviewsUrl ?? response.reviewsUrl ?? response.googleMapsUri;
  const writeReviewUrl = links.writeReviewUrl ?? response.writeReviewUrl;
  return (
    <section
      aria-labelledby="google-reviews-heading"
      className="border-y border-border bg-muted/45"
    >
      <div className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[minmax(16rem,.65fr)_minmax(0,1.7fr)] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              {section.eyebrow}
            </p>
            <h2
              className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
              id="google-reviews-heading"
            >
              {section.heading}
            </h2>
            <div className="mt-7 rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-5xl font-bold tracking-tight">
                {response.rating.toFixed(1)}
              </p>
              <Stars rating={response.rating} />
              <p className="mt-3 text-sm text-muted-foreground">
                {response.reviewCount.toLocaleString('en-CA')} Google Maps{' '}
                {response.reviewCount === 1 ? 'review' : 'reviews'}
              </p>
              <p className="sr-only">
                {response.rating.toFixed(1)} out of 5 from{' '}
                {response.reviewCount} reviews
              </p>
            </div>
          </div>
          <div
            aria-label="Google Maps customer reviews"
            className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-4 overflow-x-auto pb-3 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0"
            role="region"
            tabIndex={0}
          >
            {response.reviews.map((review) => (
              <ReviewCard key={review.googleMapsUri} review={review} />
            ))}
          </div>
        </div>
        <div className="mt-7 flex flex-col gap-5 border-t border-border pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 text-xs leading-5 text-muted-foreground">
            <p>{response.orderingNotice}</p>
            <p>
              Reviews are Google Maps user-contributed content and subject to{' '}
              <a
                className="font-medium text-foreground underline underline-offset-4"
                href="https://support.google.com/contributionpolicy/answer/7400114"
                rel="noopener noreferrer"
                target="_blank"
              >
                Google&apos;s review policies
              </a>
              .
            </p>
            <p aria-label="Google Maps attribution">
              Content provided by{' '}
              <span className="font-semibold text-foreground" translate="no">
                Google Maps
              </span>
            </p>
          </div>
          <ReviewActions
            reviewsUrl={reviewsUrl}
            writeReviewUrl={writeReviewUrl}
          />
        </div>
      </div>
    </section>
  );
}

export function HomepageGoogleReviewsFallback({
  section,
  links,
}: {
  section: ReviewSection;
  links: GoogleLinks;
}) {
  return (
    <section
      aria-labelledby="google-reviews-heading"
      className="border-y border-border bg-muted/45"
    >
      <div className="mx-auto grid min-h-72 max-w-[1760px] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8 lg:py-20">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            {section.eyebrow}
          </p>
          <h2
            className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
            id="google-reviews-heading"
          >
            {section.heading}
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            {section.description}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Customer feedback is read directly on{' '}
            <span className="font-semibold text-foreground" translate="no">
              Google Maps
            </span>
            .
          </p>
        </div>
        {links.reviewsUrl || links.writeReviewUrl ? (
          <ReviewActions
            reviewsUrl={links.reviewsUrl}
            writeReviewUrl={links.writeReviewUrl}
          />
        ) : (
          <p className="max-w-sm text-sm text-muted-foreground">
            Google review links will appear here after they are configured by
            Mensah Rentals.
          </p>
        )}
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: PublicGoogleReview }) {
  return (
    <article className="w-[min(86vw,24rem)] shrink-0 snap-start rounded-3xl border border-border bg-card p-6 shadow-sm lg:w-auto">
      <div className="flex items-center gap-3">
        {review.author.photoUri ? (
          // Google-hosted author attribution must remain direct; it is not proxied or stored.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${review.author.displayName}'s Google profile photo`}
            className="h-11 w-11 shrink-0 rounded-full bg-muted bg-cover bg-center"
            decoding="async"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={review.author.photoUri}
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
          >
            G
          </span>
        )}
        <div className="min-w-0">
          {review.author.uri ? (
            <a
              className="block truncate font-semibold underline-offset-4 hover:underline"
              href={review.author.uri}
              rel="noopener noreferrer"
              target="_blank"
            >
              {review.author.displayName}
              <span className="sr-only"> — view Google Maps profile</span>
            </a>
          ) : (
            <p className="truncate font-semibold">
              {review.author.displayName}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {review.relativePublishTimeDescription ??
              'Published on Google Maps'}
          </p>
        </div>
      </div>
      <Stars rating={review.rating} compact />
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
        {review.text}
      </p>
      {review.translated ? (
        <details className="mt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Translated by Google — show original
          </summary>
          <p className="mt-2 whitespace-pre-wrap leading-5">
            {review.originalText}
          </p>
        </details>
      ) : null}
      {review.visitDate ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Visited {review.visitDate.year}-
          {String(review.visitDate.month).padStart(2, '0')}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <a
          className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
          href={review.googleMapsUri}
          rel="noopener noreferrer"
          target="_blank"
        >
          View this review on Google Maps
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
        {review.flagContentUri ? (
          <a
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
            href={review.flagContentUri}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Flag aria-hidden="true" className="h-3.5 w-3.5" /> Report
          </a>
        ) : null}
      </div>
    </article>
  );
}

function Stars({
  rating,
  compact = false,
}: {
  rating: number;
  compact?: boolean;
}) {
  return (
    <div
      aria-label={`${rating.toFixed(1)} out of 5`}
      className={`flex items-center gap-1 text-amber-500 ${compact ? 'mt-4' : 'mt-3'}`}
      role="img"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          aria-hidden="true"
          className={compact ? 'h-4 w-4' : 'h-5 w-5'}
          fill={star <= Math.round(rating) ? 'currentColor' : 'none'}
          key={star}
        />
      ))}
    </div>
  );
}

function ReviewActions({
  reviewsUrl,
  writeReviewUrl,
}: {
  reviewsUrl: string | null;
  writeReviewUrl: string | null;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
      {reviewsUrl ? (
        <a
          className={`${externalLink} bg-primary text-primary-foreground`}
          href={reviewsUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Read reviews on Google Maps
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      ) : null}
      {writeReviewUrl ? (
        <a
          className={`${externalLink} border border-border bg-card text-foreground`}
          href={writeReviewUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Leave a review
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}
