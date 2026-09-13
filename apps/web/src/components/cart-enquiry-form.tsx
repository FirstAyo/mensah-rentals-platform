'use client';

import {
  publicCartEnquiryReceiptSchema,
  submitCartEnquirySchema,
} from '@mensah-rentals/validation';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { useCart } from '@/lib/use-cart';

const inputClass =
  'h-11 w-full rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'grid gap-2 text-sm font-medium';

export function CartEnquiryForm() {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{
    message: string;
    referenceNumber: string | null;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const input = submitCartEnquirySchema.safeParse({
      operationId: crypto.randomUUID(),
      customerName: data.get('customerName'),
      contactEmail: data.get('contactEmail'),
      contactPhone: data.get('contactPhone'),
      company: data.get('company'),
      projectName: data.get('projectName'),
      rentalStartDate: data.get('rentalStartDate'),
      rentalEndDate: data.get('rentalEndDate'),
      fulfilmentMethod: data.get('fulfilmentMethod'),
      location: data.get('location'),
      additionalEquipment: data.get('additionalEquipment'),
      customerNotes: data.get('customerNotes'),
      website: data.get('website'),
    });
    if (!input.success) {
      setError(
        input.error.issues[0]?.message ?? 'Review the form and try again.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/cart-enquiries', {
        body: JSON.stringify(input.data),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const record =
          body && typeof body === 'object'
            ? (body as Record<string, unknown>)
            : {};
        throw new Error(
          typeof record.message === 'string'
            ? record.message
            : 'Your rental enquiry could not be submitted.',
        );
      }
      const parsed = publicCartEnquiryReceiptSchema.parse(body);
      setReceipt(parsed);
      await cart.refetch();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Your rental enquiry could not be submitted.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt)
    return (
      <section
        className="mx-auto max-w-2xl rounded-3xl border border-emerald-500/30 bg-card p-6 text-center shadow-sm sm:p-10"
        tabIndex={-1}
      >
        <CheckCircle2
          aria-hidden="true"
          className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400"
        />
        <h1 className="mt-5 text-3xl font-bold tracking-tight">
          Rental enquiry received
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          {receipt.message}
        </p>
        {receipt.referenceNumber ? (
          <p className="mt-5 text-sm">
            Reference{' '}
            <strong className="ml-1 text-base">
              {receipt.referenceNumber}
            </strong>
          </p>
        ) : null}
        <Link
          className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          href="/rentals"
        >
          Browse more equipment
        </Link>
      </section>
    );

  return (
    <form
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
      onSubmit={submit}
    >
      <div className="space-y-7 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
        <fieldset className="grid gap-5 sm:grid-cols-2" disabled={busy}>
          <legend className="mb-5 text-xl font-semibold">Your details</legend>
          <label className={labelClass}>
            Name *
            <input
              className={inputClass}
              name="customerName"
              required
              maxLength={160}
            />
          </label>
          <label className={labelClass}>
            Email *
            <input
              className={inputClass}
              name="contactEmail"
              required
              type="email"
              maxLength={254}
            />
          </label>
          <label className={labelClass}>
            Phone *
            <input
              className={inputClass}
              name="contactPhone"
              required
              maxLength={40}
            />
          </label>
          <label className={labelClass}>
            Company or organization
            <input className={inputClass} name="company" maxLength={160} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Event or project name
            <input className={inputClass} name="projectName" maxLength={180} />
          </label>
        </fieldset>
        <fieldset className="grid gap-5 sm:grid-cols-2" disabled={busy}>
          <legend className="mb-5 text-xl font-semibold">Rental details</legend>
          <label className={labelClass}>
            Start date *
            <input
              className={inputClass}
              name="rentalStartDate"
              required
              type="date"
            />
          </label>
          <label className={labelClass}>
            End date *
            <input
              className={inputClass}
              name="rentalEndDate"
              required
              type="date"
            />
          </label>
          <label className={labelClass}>
            Fulfilment *
            <select
              className={inputClass}
              defaultValue="PICKUP"
              name="fulfilmentMethod"
            >
              <option value="PICKUP">Pickup</option>
              <option value="DELIVERY">Delivery</option>
              <option value="DELIVERY_AND_SETUP">Delivery and setup</option>
            </select>
          </label>
          <label className={labelClass}>
            Location
            <input className={inputClass} name="location" maxLength={300} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Additional or unlisted equipment
            <textarea
              className="min-h-28 rounded-lg border border-border bg-background p-3"
              maxLength={1500}
              name="additionalEquipment"
            />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Notes
            <textarea
              className="min-h-32 rounded-lg border border-border bg-background p-3"
              maxLength={3000}
              name="customerNotes"
            />
          </label>
          <label className="sr-only" aria-hidden="true">
            Website
            <input autoComplete="off" name="website" tabIndex={-1} />
          </label>
        </fieldset>
      </div>
      <aside className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:sticky lg:top-24">
        <h2 className="text-xl font-semibold">Equipment enquiry</h2>
        {cart.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Loading your cart…
          </p>
        ) : null}
        {cart.data ? (
          <>
            <ul className="mt-4 space-y-3 text-sm">
              {cart.data.items.map((item) => (
                <li
                  className="flex justify-between gap-4"
                  key={item.product.slug}
                >
                  <span>{item.product.name}</span>
                  <strong>× {item.desiredQuantity}</strong>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
              This is an enquiry, not a confirmed reservation or checkout. No
              final price or stock quantity is shown.
            </p>
          </>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
          disabled={busy || !cart.data?.items.length}
          type="submit"
        >
          {busy ? (
            <LoaderCircle
              aria-hidden="true"
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Send aria-hidden="true" className="h-4 w-4" />
          )}
          {busy ? 'Sending enquiry…' : 'Send rental enquiry'}
        </button>
      </aside>
    </form>
  );
}
