'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  submitRentalRequestSchema,
  type SubmitRentalRequestFormInput,
  type SubmitRentalRequestInput,
} from '@mensah-rentals/validation';

import { useCart } from '@/lib/use-cart';
import { useSubmitRentalRequest } from '@/lib/use-rental-request';

const inputClass =
  'mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
const labelClass = 'block text-sm font-semibold';

function ErrorText({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-sm text-red-700 dark:text-red-300">
      {message}
    </p>
  ) : null;
}

export function RentalRequestForm() {
  const router = useRouter();
  const cart = useCart();
  const submission = useSubmitRentalRequest();
  const [step, setStep] = useState<'details' | 'review'>('details');
  const [reviewData, setReviewData] = useState<SubmitRentalRequestInput | null>(
    null,
  );
  const errorSummary = useRef<HTMLDivElement>(null);
  const form = useForm<
    SubmitRentalRequestFormInput,
    unknown,
    SubmitRentalRequestInput
  >({
    resolver: zodResolver(submitRentalRequestSchema),
    defaultValues: {
      submissionId: crypto.randomUUID(),
      companyName: null,
      contactEmail: '',
      contactFirstName: '',
      contactLastName: '',
      contactPhone: '',
      customerNotes: null,
      deliveryAddress: null,
      fulfillmentMethod: 'PICKUP',
      projectLocation: '',
      projectName: '',
      projectType: '',
      rentalEndDate: '',
      rentalStartDate: '',
      requestedTimeZone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  });
  const errors = form.formState.errors;
  const fulfillment = form.watch('fulfillmentMethod');

  useEffect(() => {
    if (submission.isError) errorSummary.current?.focus();
  }, [submission.isError]);

  if (cart.isPending)
    return (
      <div
        aria-busy="true"
        className="rounded-2xl border bg-card p-10 text-center"
      >
        <Loader2 aria-hidden="true" className="mx-auto h-8 w-8 animate-spin" />
        <p className="mt-3 font-semibold">Loading your cart…</p>
      </div>
    );
  if (cart.isError)
    return (
      <div role="alert" className="rounded-2xl border bg-card p-8 text-center">
        <AlertCircle
          aria-hidden="true"
          className="mx-auto h-8 w-8 text-red-700 dark:text-red-300"
        />
        <p className="mt-3 font-semibold">Your cart could not be loaded.</p>
        <button
          className="mt-4 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground"
          onClick={() => void cart.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  if (!cart.data.items.length)
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
        <h2 className="text-2xl font-semibold">Your cart is empty</h2>
        <p className="mt-2 text-muted-foreground">
          Add equipment before preparing a rental request.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          href="/rentals"
        >
          Browse equipment
        </Link>
      </div>
    );
  if (cart.data.items.some((item) => !item.product.requestable))
    return (
      <div role="alert" className="rounded-2xl border bg-card p-8">
        <h2 className="text-xl font-semibold">Review your cart first</h2>
        <p className="mt-2 text-muted-foreground">
          A selected product is no longer listed. Remove it before submitting
          your request.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          href="/cart"
        >
          Return to cart
        </Link>
      </div>
    );

  async function submit() {
    if (!reviewData) return;
    try {
      const request = await submission.mutateAsync(reviewData);
      router.push(`/rental-requests/${request.referenceNumber}`);
    } catch {
      // The mutation error renders an alert; the effect focuses it after mount.
    }
  }

  return (
    <div>
      <ol
        aria-label="Rental request progress"
        className="mb-8 grid grid-cols-2 gap-3 text-sm font-semibold"
      >
        <li
          aria-current={step === 'details' ? 'step' : undefined}
          className={`rounded-xl border p-3 ${step === 'details' ? 'border-primary bg-accent' : 'bg-card'}`}
        >
          1. Request details
        </li>
        <li
          aria-current={step === 'review' ? 'step' : undefined}
          className={`rounded-xl border p-3 ${step === 'review' ? 'border-primary bg-accent' : 'bg-card'}`}
        >
          2. Review and submit
        </li>
      </ol>

      {step === 'details' ? (
        <form
          className="grid gap-8"
          noValidate
          onSubmit={form.handleSubmit(
            (data) => {
              setReviewData(data);
              setStep('review');
            },
            () => setTimeout(() => errorSummary.current?.focus()),
          )}
        >
          {Object.keys(errors).length ? (
            <div
              ref={errorSummary}
              role="alert"
              tabIndex={-1}
              className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 outline-none dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"
            >
              <p className="font-semibold">
                Please correct the highlighted fields.
              </p>
            </div>
          ) : null}

          <fieldset className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6">
            <legend className="px-2 text-xl font-semibold">
              Contact information
            </legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                First name
                <input
                  aria-describedby={
                    errors.contactFirstName
                      ? 'contact-first-name-error'
                      : undefined
                  }
                  aria-invalid={!!errors.contactFirstName}
                  autoComplete="given-name"
                  className={inputClass}
                  {...form.register('contactFirstName')}
                />
                <ErrorText
                  id="contact-first-name-error"
                  message={errors.contactFirstName?.message}
                />
              </label>
              <label className={labelClass}>
                Last name
                <input
                  aria-describedby={
                    errors.contactLastName
                      ? 'contact-last-name-error'
                      : undefined
                  }
                  aria-invalid={!!errors.contactLastName}
                  autoComplete="family-name"
                  className={inputClass}
                  {...form.register('contactLastName')}
                />
                <ErrorText
                  id="contact-last-name-error"
                  message={errors.contactLastName?.message}
                />
              </label>
              <label className={labelClass}>
                Email
                <input
                  aria-describedby={
                    errors.contactEmail ? 'contact-email-error' : undefined
                  }
                  aria-invalid={!!errors.contactEmail}
                  autoComplete="email"
                  className={inputClass}
                  type="email"
                  {...form.register('contactEmail')}
                />
                <ErrorText
                  id="contact-email-error"
                  message={errors.contactEmail?.message}
                />
              </label>
              <label className={labelClass}>
                Phone
                <input
                  aria-describedby={
                    errors.contactPhone ? 'contact-phone-error' : undefined
                  }
                  aria-invalid={!!errors.contactPhone}
                  autoComplete="tel"
                  className={inputClass}
                  type="tel"
                  {...form.register('contactPhone')}
                />
                <ErrorText
                  id="contact-phone-error"
                  message={errors.contactPhone?.message}
                />
              </label>
            </div>
            <label className={labelClass}>
              Company or organization{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
              <input
                aria-describedby={
                  errors.companyName ? 'company-name-error' : undefined
                }
                aria-invalid={!!errors.companyName}
                autoComplete="organization"
                className={inputClass}
                {...form.register('companyName')}
              />
              <ErrorText
                id="company-name-error"
                message={errors.companyName?.message}
              />
            </label>
          </fieldset>

          <fieldset className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6">
            <legend className="px-2 text-xl font-semibold">
              Project and rental period
            </legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                Project or event name
                <input
                  aria-describedby={
                    errors.projectName ? 'project-name-error' : undefined
                  }
                  aria-invalid={!!errors.projectName}
                  className={inputClass}
                  {...form.register('projectName')}
                />
                <ErrorText
                  id="project-name-error"
                  message={errors.projectName?.message}
                />
              </label>
              <label className={labelClass}>
                Project or event type
                <input
                  aria-describedby={
                    errors.projectType ? 'project-type-error' : undefined
                  }
                  aria-invalid={!!errors.projectType}
                  className={inputClass}
                  placeholder="Event, production, construction…"
                  {...form.register('projectType')}
                />
                <ErrorText
                  id="project-type-error"
                  message={errors.projectType?.message}
                />
              </label>
              <label className={labelClass}>
                Rental start date
                <input
                  aria-describedby={
                    errors.rentalStartDate
                      ? 'rental-start-date-error'
                      : undefined
                  }
                  aria-invalid={!!errors.rentalStartDate}
                  className={inputClass}
                  type="date"
                  {...form.register('rentalStartDate')}
                />
                <ErrorText
                  id="rental-start-date-error"
                  message={errors.rentalStartDate?.message}
                />
              </label>
              <label className={labelClass}>
                Rental end date
                <input
                  aria-describedby={
                    errors.rentalEndDate ? 'rental-end-date-error' : undefined
                  }
                  aria-invalid={!!errors.rentalEndDate}
                  className={inputClass}
                  type="date"
                  {...form.register('rentalEndDate')}
                />
                <ErrorText
                  id="rental-end-date-error"
                  message={errors.rentalEndDate?.message}
                />
              </label>
            </div>
            <label className={labelClass}>
              Project or event location
              <textarea
                aria-describedby={
                  errors.projectLocation ? 'project-location-error' : undefined
                }
                aria-invalid={!!errors.projectLocation}
                className={inputClass}
                rows={3}
                {...form.register('projectLocation')}
              />
              <ErrorText
                id="project-location-error"
                message={errors.projectLocation?.message}
              />
            </label>
          </fieldset>

          <fieldset className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6">
            <legend className="px-2 text-xl font-semibold">Fulfillment</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['PICKUP', 'Customer pickup'],
                ['DELIVERY', 'Delivery'],
                ['DELIVERY_AND_SETUP', 'Delivery and setup'],
              ].map(([value, label]) => (
                <label
                  className="flex min-h-12 items-center gap-3 rounded-xl border bg-background p-3 font-semibold"
                  key={value}
                >
                  <input
                    type="radio"
                    value={value}
                    {...form.register('fulfillmentMethod')}
                  />
                  {label}
                </label>
              ))}
            </div>
            {fulfillment !== 'PICKUP' ? (
              <label className={labelClass}>
                Delivery address
                <textarea
                  aria-describedby={
                    errors.deliveryAddress
                      ? 'delivery-address-error'
                      : undefined
                  }
                  aria-invalid={!!errors.deliveryAddress}
                  autoComplete="street-address"
                  className={inputClass}
                  rows={3}
                  {...form.register('deliveryAddress')}
                />
                <ErrorText
                  id="delivery-address-error"
                  message={errors.deliveryAddress?.message}
                />
              </label>
            ) : null}
            <label className={labelClass}>
              Special instructions{' '}
              <span className="font-normal text-muted-foreground">
                (optional; do not include sensitive information)
              </span>
              <textarea
                aria-describedby={
                  errors.customerNotes ? 'customer-notes-error' : undefined
                }
                aria-invalid={!!errors.customerNotes}
                className={inputClass}
                rows={4}
                {...form.register('customerNotes')}
              />
              <ErrorText
                id="customer-notes-error"
                message={errors.customerNotes?.message}
              />
            </label>
          </fieldset>

          <div className="flex flex-wrap justify-between gap-3">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 font-semibold hover:bg-muted"
              href="/cart"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Edit cart
            </Link>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
              type="submit"
            >
              Review request
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section
            className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6"
            aria-labelledby="review-heading"
          >
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
                Final review
              </p>
              <h2 id="review-heading" className="mt-1 text-2xl font-semibold">
                Check your request
              </h2>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Contact</dt>
                <dd className="font-semibold">
                  {reviewData?.contactFirstName} {reviewData?.contactLastName}
                </dd>
                <dd>{reviewData?.contactEmail}</dd>
                <dd>{reviewData?.contactPhone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Project</dt>
                <dd className="font-semibold">{reviewData?.projectName}</dd>
                <dd>{reviewData?.projectType}</dd>
                <dd>{reviewData?.projectLocation}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rental dates</dt>
                <dd className="font-semibold">
                  {reviewData?.rentalStartDate} to {reviewData?.rentalEndDate}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fulfillment</dt>
                <dd className="font-semibold">
                  {reviewData?.fulfillmentMethod.replaceAll('_', ' ')}
                </dd>
                {reviewData?.deliveryAddress ? (
                  <dd>{reviewData.deliveryAddress}</dd>
                ) : null}
              </div>
            </dl>
            <div>
              <h3 className="font-semibold">Requested equipment</h3>
              <ul className="mt-3 divide-y rounded-xl border">
                {cart.data.items.map((item) => (
                  <li
                    className="flex justify-between gap-4 p-3"
                    key={item.product.slug}
                  >
                    <span>{item.product.name}</span>
                    <span className="font-semibold">
                      {item.desiredQuantity} {item.product.rentalUnit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg px-4 font-semibold hover:bg-muted"
              onClick={() => setStep('details')}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Edit details
            </button>
          </section>
          <aside className="rounded-2xl border bg-card p-6 lg:sticky lg:top-24">
            <ClipboardCheck
              aria-hidden="true"
              className="h-7 w-7 text-primary"
            />
            <h2 className="mt-3 text-xl font-semibold">
              Submit for staff review
            </h2>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
              <li>Submitting does not reserve equipment.</li>
              <li>No final rental price is calculated.</li>
              <li>
                Staff may approve, partially approve, or reject requested
                quantities.
              </li>
            </ul>
            {submission.isError ? (
              <div
                ref={errorSummary}
                role="alert"
                tabIndex={-1}
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900 outline-none dark:bg-red-950/30 dark:text-red-100"
              >
                <p className="font-semibold">Your request was not confirmed.</p>
                <p>{submission.error.message}</p>
              </div>
            ) : null}
            <button
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60"
              disabled={submission.isPending}
              onClick={() => void submit()}
              type="button"
            >
              {submission.isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              )}
              {submission.isPending ? 'Submitting…' : 'Submit rental request'}
            </button>
            <p aria-live="polite" className="sr-only">
              {submission.isPending ? 'Submitting your rental request.' : ''}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
