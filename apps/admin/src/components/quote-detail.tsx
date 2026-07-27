'use client';

import type {
  AdminQuoteDetailResponse,
  AdminQuoteSendResponse,
} from '@mensah-rentals/types';
import { Copy, Send } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QuoteEditor } from './quote-editor';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});

export function QuoteDetail({
  canSend,
  canUpdate,
  id,
}: {
  canSend: boolean;
  canUpdate: boolean;
  id: string;
}) {
  const [quote, setQuote] = useState<AdminQuoteDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const sendOperation = useRef<{ id: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/quotes/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    setQuote((await response.json()) as AdminQuoteDetailResponse);
  }, [id]);
  useEffect(() => {
    void load().catch(() => setError('Quote could not be loaded.'));
  }, [load]);
  async function send() {
    const revision = quote?.revisions[0];
    if (
      !revision ||
      pending ||
      !window.confirm(
        `Send revision ${revision.revisionNumber} for ${cad.format(revision.totalCents / 100)}? This does not create an order or reserve inventory.`,
      )
    )
      return;
    setPending(true);
    setError(null);
    try {
      const operationKey = `${revision.id}:${revision.lifecycleVersion}`;
      if (sendOperation.current?.key !== operationKey)
        sendOperation.current = {
          id: crypto.randomUUID(),
          key: operationKey,
        };
      const response = await fetch(
        `/api/quotes/${id}/revisions/${revision.id}/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: sendOperation.current.id,
            expectedLifecycleVersion: revision.lifecycleVersion,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'The quote changed. Refresh and try again.'
            : 'The quote could not be sent.',
        );
      const result = (await response.json()) as AdminQuoteSendResponse;
      setAccessLink(result.accessLink);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The quote could not be sent.',
      );
    } finally {
      setPending(false);
    }
  }
  if (!quote)
    return (
      <p aria-live="polite" className="rounded-xl border p-8">
        {error ?? 'Loading quote…'}
      </p>
    );
  const latest = quote.revisions[0]!;
  return (
    <div className="space-y-7">
      <header>
        <Link
          className="text-sm text-muted-foreground underline"
          href="/quotes"
        >
          Back to quotes
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider">
              {quote.rentalRequest.referenceNumber}
            </p>
            <h1 className="mt-2 break-all text-3xl font-bold">
              {quote.quoteNumber}
            </h1>
            <p className="mt-2 text-muted-foreground">{quote.customer.name}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1.5 font-semibold">
            {latest.status}
          </span>
        </div>
      </header>
      <div className="rounded-xl border bg-muted/40 p-4 font-medium">
        {quote.notice}
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border p-4">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {canSend && latest.status === 'DRAFT' ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={pending}
            onClick={() => void send()}
          >
            <Send className="h-4 w-4" />
            {pending ? 'Sending…' : 'Send current revision'}
          </button>
        ) : null}
        {canUpdate && latest.status !== 'ACCEPTED' ? (
          <button
            className="min-h-11 rounded-lg border px-4 py-2 font-semibold"
            onClick={() => setRevising((value) => !value)}
          >
            {revising ? 'Cancel new revision' : 'Create new revision'}
          </button>
        ) : null}
      </div>
      {accessLink ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Secure customer link</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Shown only after send or an idempotent send retry. Share through an
            approved private channel. The capability is in the URL fragment and
            is exchanged immediately.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded bg-muted p-3 text-xs">
              {accessLink}
            </code>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4"
              onClick={() => void navigator.clipboard.writeText(accessLink)}
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          </div>
        </section>
      ) : null}
      {revising ? (
        <section className="border-t pt-7">
          <QuoteEditor
            onSaved={async () => {
              setRevising(false);
              setAccessLink(null);
              await load();
            }}
            quoteId={quote.id}
            requestId={quote.rentalRequest.id}
          />
        </section>
      ) : null}
      <section>
        <h2 className="text-2xl font-semibold">Immutable revision history</h2>
        <ol className="mt-4 space-y-5">
          {quote.revisions.map((revision) => (
            <li
              className="rounded-xl border border-border bg-card p-5"
              key={revision.id}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">
                    Revision {revision.revisionNumber}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Created {new Date(revision.createdAt).toLocaleString()} by{' '}
                    {revision.createdBy.firstName} {revision.createdBy.lastName}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                    {revision.status}
                  </span>
                  <p className="mt-2 text-xl font-bold">
                    {cad.format(revision.totalCents / 100)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {revision.items.map((item) => (
                  <div
                    className="flex flex-col justify-between gap-2 rounded-lg bg-muted/50 p-3 sm:flex-row"
                    key={item.id}
                  >
                    <span>
                      {item.productName} · {item.quotedQuantity}{' '}
                      {item.rentalUnit}
                    </span>
                    <span>
                      {cad.format(item.unitPriceCents / 100)} each ·{' '}
                      {cad.format(item.lineSubtotalCents / 100)}
                    </span>
                  </div>
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 border-t pt-4">
                <dt>Subtotal</dt>
                <dd>{cad.format(revision.subtotalCents / 100)}</dd>
                <dt>Discount</dt>
                <dd>-{cad.format(revision.discountCents / 100)}</dd>
                <dt>{revision.tax.name}</dt>
                <dd>{cad.format(revision.taxCents / 100)}</dd>
                <dt className="font-bold">Total</dt>
                <dd className="font-bold">
                  {cad.format(revision.totalCents / 100)}
                </dd>
              </dl>
              {revision.customerResponse ? (
                <p className="mt-4 rounded-lg bg-muted p-3 font-semibold">
                  Customer {revision.customerResponse.response.toLowerCase()}{' '}
                  this revision on{' '}
                  {new Date(
                    revision.customerResponse.respondedAt,
                  ).toLocaleString()}
                  .
                </p>
              ) : null}
              <div className="mt-4 grid gap-4 border-t pt-4 lg:grid-cols-2">
                <div>
                  <h4 className="font-semibold">Customer-visible content</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {revision.customerNotes || 'No customer notes.'}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold">Internal notes</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {revision.internalNotes || 'No internal notes.'}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
