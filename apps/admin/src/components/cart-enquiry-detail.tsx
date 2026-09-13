'use client';

import type { AdminCartEnquiryResponse } from '@mensah-rentals/types';
import { CalendarDays, Mail, Package, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { DeliveryStatusBadge, EnquiryStatusBadge } from './cart-enquiry-list';

export function CartEnquiryDetail({
  canManage,
  id,
}: {
  canManage: boolean;
  id: string;
}) {
  const [data, setData] = useState<AdminCartEnquiryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/cart-enquiries/${id}`, {
        cache: 'no-store',
      });
      const result = (await response.json().catch(() => null)) as
        | AdminCartEnquiryResponse
        | { message?: string }
        | null;
      if (!response.ok || !result || !('items' in result))
        throw new Error(
          result && 'message' in result && result.message
            ? result.message
            : 'Cart enquiry could not be loaded.',
        );
      setData(result);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Cart enquiry could not be loaded.',
      );
    }
  }, [id]);

  useEffect(() => void load(), [load]);

  async function mutate(path: string, method: 'POST' | 'PUT', body: object) {
    if (busyAction) return;
    setBusyAction(path);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/cart-enquiries/${id}/${path}`, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method,
      });
      const result = (await response.json().catch(() => null)) as
        | AdminCartEnquiryResponse
        | { message?: string }
        | null;
      if (!response.ok || !result || !('items' in result))
        throw new Error(
          result && 'message' in result && result.message
            ? result.message
            : 'The enquiry could not be updated.',
        );
      setData(result);
      setNotice(
        path === 'email/retry'
          ? 'The company email delivery was retried.'
          : 'The enquiry status was updated.',
      );
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'The enquiry could not be updated.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  if (!data)
    return error ? (
      <div
        className="rounded-xl border border-destructive/40 bg-card p-6"
        role="alert"
      >
        <p className="font-semibold">Cart enquiry unavailable</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button
          className="mt-4 min-h-11 rounded-md border px-4 text-sm font-medium"
          onClick={() => void load()}
          type="button"
        >
          Try again
        </button>
      </div>
    ) : (
      <p aria-live="polite">Loading cart enquiry…</p>
    );

  const canRetry =
    canManage &&
    (data.delivery.status === 'FAILED' || data.delivery.status === 'QUEUED');

  return (
    <div className="space-y-6">
      <header>
        <Link
          className="text-sm font-medium text-muted-foreground underline underline-offset-4"
          href="/enquiries"
        >
          Back to cart enquiries
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {data.referenceNumber}
          </h1>
          <EnquiryStatusBadge status={data.status} />
        </div>
        <p className="mt-2 text-muted-foreground">
          Received {formatDateTime(data.createdAt)}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Mail aria-hidden="true" className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Customer and project</h2>
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <Detail label="Customer name" value={data.customerName} />
              <Detail
                href={`mailto:${data.contactEmail}`}
                label="Email"
                value={data.contactEmail}
              />
              <Detail
                href={`tel:${data.contactPhone}`}
                label="Phone"
                value={data.contactPhone}
              />
              <Detail label="Company" value={data.company ?? 'Not provided'} />
              <Detail
                label="Project or event"
                value={data.projectName ?? 'Not provided'}
              />
              <Detail
                label="Fulfilment"
                value={humanize(data.fulfilmentMethod)}
              />
              <Detail
                label="Location"
                value={data.location ?? 'Not provided'}
              />
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <CalendarDays
                aria-hidden="true"
                className="h-5 w-5 text-primary"
              />
              <h2 className="text-lg font-semibold">Rental timing</h2>
            </div>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <Detail
                label="Start date"
                value={formatDate(data.rentalStartDate)}
              />
              <Detail label="End date" value={formatDate(data.rentalEndDate)} />
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Package aria-hidden="true" className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Requested equipment</h2>
            </div>
            <ul className="mt-5 divide-y rounded-lg border">
              {data.items.map((item, index) => (
                <li
                  className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  key={`${item.productSlug}-${index}`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{item.productName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.categoryName}
                    </p>
                  </div>
                  <p className="text-sm sm:text-right">
                    <span className="font-semibold tabular-nums">
                      {item.requestedQuantity}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      {item.rentalUnit}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-5 rounded-xl border bg-card p-5 sm:p-6">
            <LongText
              label="Additional equipment"
              value={data.additionalEquipment}
            />
            <LongText label="Customer notes" value={data.customerNotes} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Enquiry status</h2>
            {canManage ? (
              <div className="mt-4 grid gap-2">
                {(['NEW', 'READ', 'RESOLVED'] as const).map((status) => (
                  <button
                    aria-pressed={data.status === status}
                    className="min-h-11 rounded-md border px-4 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={Boolean(busyAction) || data.status === status}
                    key={status}
                    onClick={() =>
                      void mutate('status', 'PUT', {
                        operationId: crypto.randomUUID(),
                        status,
                      })
                    }
                    type="button"
                  >
                    Mark as {humanize(status)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                You have view-only access to this enquiry.
              </p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Company email delivery</h2>
              <DeliveryStatusBadge status={data.delivery.status} />
            </div>
            <dl className="mt-5 grid gap-4">
              <Detail
                label="Attempts"
                value={String(data.delivery.attemptCount)}
              />
              <Detail
                label="Last updated"
                value={formatDateTime(data.delivery.updatedAt)}
              />
            </dl>
            {data.delivery.lastErrorMessage ? (
              <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                  Last delivery error
                </p>
                <p className="mt-2 break-words text-sm">
                  {data.delivery.lastErrorMessage}
                </p>
              </div>
            ) : null}
            {canRetry ? (
              <button
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void mutate('email/retry', 'POST', {
                    operationId: crypto.randomUUID(),
                  })
                }
                type="button"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Retry company email
              </button>
            ) : null}
            {data.delivery.status === 'SENT' ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Delivery succeeded. A sent email cannot be retried.
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      {notice ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Detail({
  href,
  label,
  value,
}: {
  href?: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">
        {href ? (
          <a className="underline underline-offset-4" href={href}>
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function LongText({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <h2 className="font-semibold">{label}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {value ?? 'Not provided'}
      </p>
    </div>
  );
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll('_', ' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
