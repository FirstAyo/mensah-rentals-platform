'use client';

import type { PublicQuoteResponse } from '@mensah-rentals/types';
import { Quote, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});
const money = (cents: number) => cad.format(cents / 100);

export function CustomerQuote() {
  const [quote, setQuote] = useState<PublicQuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const responseOperation = useRef<{ id: string; key: string } | null>(null);

  async function load(markViewed = false) {
    const response = await fetch(
      markViewed ? '/api/quote/view' : '/api/quote',
      {
        method: markViewed ? 'POST' : 'GET',
        headers: markViewed
          ? { 'Content-Type': 'application/json' }
          : undefined,
        body: markViewed ? '{}' : undefined,
        cache: 'no-store',
      },
    );
    if (!response.ok) throw new Error();
    setQuote((await response.json()) as PublicQuoteResponse);
  }
  useEffect(() => {
    void load(true).catch(() => setError('This quote is unavailable.'));
  }, []);

  async function respond(responseKind: 'ACCEPTED' | 'REJECTED') {
    if (
      pending ||
      !window.confirm(
        `Confirm that you want to ${responseKind === 'ACCEPTED' ? 'accept' : 'reject'} this quote?`,
      )
    )
      return;
    setPending(true);
    setError(null);
    try {
      const operationKey = `${quote?.quoteNumber}:${quote?.revisionNumber}:${responseKind}`;
      if (responseOperation.current?.key !== operationKey)
        responseOperation.current = {
          id: crypto.randomUUID(),
          key: operationKey,
        };
      const response = await fetch('/api/quote/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: responseOperation.current.id,
          response: responseKind,
          note: null,
        }),
      });
      if (!response.ok) throw new Error();
      setQuote((await response.json()) as PublicQuoteResponse);
    } catch {
      setError(
        'This quote could not be updated. It may no longer be actionable.',
      );
    } finally {
      setPending(false);
    }
  }

  if (error && !quote)
    return (
      <div className="rounded-xl border border-border bg-card p-8" role="alert">
        <h1 className="text-2xl font-bold">Quote unavailable</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  if (!quote)
    return (
      <p aria-live="polite" className="rounded-xl border p-8">
        Loading your private quote…
      </p>
    );
  const actionable = quote.status === 'SENT' || quote.status === 'VIEWED';
  return (
    <article className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
        <div>
          <div className="flex items-center gap-2">
            <Quote className="h-5 w-5" aria-hidden="true" />
            <p className="font-semibold">Mensah Rentals</p>
          </div>
          <h1 className="mt-3 break-all text-3xl font-bold">
            Quote {quote.quoteNumber}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Revision {quote.revisionNumber} · {quote.customerName}
          </p>
        </div>
        <span className="self-start rounded-full bg-muted px-3 py-1.5 text-sm font-semibold">
          {quote.status}
        </span>
      </header>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Rental period</h2>
        <p className="mt-2">
          {quote.rentalStartDate} to {quote.rentalEndDate}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Valid until {new Date(quote.validUntil).toLocaleString()}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Quoted equipment</h2>
        {quote.items.map((item) => (
          <div
            className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto]"
            key={item.productSlug}
          >
            <div>
              <p className="font-semibold">{item.productName}</p>
              <p className="text-sm text-muted-foreground">
                {item.quotedQuantity} {item.rentalUnit} · approved maximum{' '}
                {item.approvedQuantity}
              </p>
            </div>
            <p>{money(item.unitPriceCents)} each</p>
            <p className="font-semibold">{money(item.lineSubtotalCents)}</p>
          </div>
        ))}
      </section>
      {quote.charges.length ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Additional charges</h2>
          <dl className="mt-3 space-y-2">
            {quote.charges.map((charge, index) => (
              <div
                className="flex justify-between gap-4"
                key={`${charge.type}-${index}`}
              >
                <dt>{charge.label}</dt>
                <dd>{money(charge.amountCents)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Totals</h2>
        <dl className="mt-3 space-y-2">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{money(quote.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Discount</dt>
            <dd>-{money(quote.discountCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>
              {quote.tax.name} ({quote.tax.rateBasisPoints / 100}%)
            </dt>
            <dd>{money(quote.taxCents)}</dd>
          </div>
          <div className="flex justify-between border-t pt-3 text-lg font-bold">
            <dt>Total CAD</dt>
            <dd>{money(quote.totalCents)}</dd>
          </div>
        </dl>
      </section>
      {quote.customerNotes ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap">{quote.customerNotes}</p>
        </section>
      ) : null}
      {quote.terms ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Terms</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{quote.terms}</p>
        </section>
      ) : null}
      <div className="rounded-xl border border-border bg-muted/50 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{quote.notice}</p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border p-4">
          {error}
        </p>
      ) : null}
      {actionable ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="min-h-11 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={pending}
            onClick={() => void respond('ACCEPTED')}
            type="button"
          >
            Accept quote
          </button>
          <button
            className="min-h-11 rounded-lg border border-border px-5 py-3 font-semibold disabled:opacity-50"
            disabled={pending}
            onClick={() => void respond('REJECTED')}
            type="button"
          >
            Reject quote
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-muted p-4 font-semibold">
          This quote is {quote.status.toLowerCase()} and no longer has response
          actions.
        </p>
      )}
    </article>
  );
}
