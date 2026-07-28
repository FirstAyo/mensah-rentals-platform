'use client';

import type {
  AdminQuoteDetailResponse,
  AdminRentalOrderCreateResponse,
  AdminQuoteSendResponse,
} from '@mensah-rentals/types';
import {
  Copy,
  FileDown,
  KeyRound,
  RefreshCw,
  Send,
  ShoppingBag,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QuoteEditor } from './quote-editor';
import { invalidateWorkSummary } from '@/lib/work-summary';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});

export function QuoteDetail({
  canCreateOrder,
  canSend,
  canUpdate,
  id,
}: {
  canCreateOrder: boolean;
  canSend: boolean;
  canUpdate: boolean;
  id: string;
}) {
  const [quote, setQuote] = useState<AdminQuoteDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<
    AdminRentalOrderCreateResponse['order'] | null
  >(null);
  const sendOperation = useRef<{ id: string; key: string } | null>(null);
  const deliveryOperation = useRef<{ id: string; key: string } | null>(null);
  const orderOperation = useRef<{ id: string; key: string } | null>(null);
  const orderDialog = useRef<HTMLDialogElement | null>(null);
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
      invalidateWorkSummary();
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
  async function deliverAgain(mode: 'resend' | 'access/rotate') {
    const revision = quote?.revisions[0];
    if (!revision || pending) return;
    const action =
      mode === 'resend'
        ? 'resend the current secure link'
        : 'revoke the current link and issue a new one';
    if (
      !window.confirm(
        `Confirm that you want to ${action}? This does not create a quote revision.`,
      )
    )
      return;
    setPending(true);
    setError(null);
    try {
      const key = `${mode}:${revision.id}:${revision.lifecycleVersion}`;
      if (deliveryOperation.current?.key !== key)
        deliveryOperation.current = { id: crypto.randomUUID(), key };
      const response = await fetch(
        `/api/quotes/${id}/revisions/${revision.id}/${mode}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: deliveryOperation.current.id,
            expectedLifecycleVersion: revision.lifecycleVersion,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'The secure link changed. Refresh and try again.'
            : 'The secure link action could not be completed.',
        );
      const result = (await response.json()) as AdminQuoteSendResponse;
      setAccessLink(result.accessLink);
      await load();
      invalidateWorkSummary();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The secure link action could not be completed.',
      );
    } finally {
      setPending(false);
    }
  }
  async function createOrder() {
    if (!quote) return;
    const currentQuote = quote;
    const revision = currentQuote.revisions.find(
      (candidate) => candidate.id === currentQuote.customerRevisionId,
    );
    if (!revision || revision.status !== 'ACCEPTED' || pending) return;
    setPending(true);
    setError(null);
    try {
      const operationKey = `${currentQuote.id}:${revision.id}`;
      if (orderOperation.current?.key !== operationKey)
        orderOperation.current = {
          id: crypto.randomUUID(),
          key: operationKey,
        };
      const response = await fetch(
        `/api/quotes/${currentQuote.id}/revisions/${revision.id}/order`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: orderOperation.current.id }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) await load();
        const message =
          response.status === 409
            ? 'This quote changed or already has an order. Refresh and review it before trying again.'
            : response.status === 422
              ? 'This accepted quote is no longer eligible for conversion.'
              : 'The rental order could not be created.';
        throw new Error(message);
      }
      const result = (await response.json()) as AdminRentalOrderCreateResponse;
      setCreatedOrder(result.order);
      orderDialog.current?.close();
      await load();
      invalidateWorkSummary();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The rental order could not be created.',
      );
      orderDialog.current?.close();
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
  const acceptedRevision = quote.revisions.find(
    (revision) =>
      revision.id === quote.customerRevisionId &&
      revision.status === 'ACCEPTED',
  );
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
        {canCreateOrder && acceptedRevision && !quote.order ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={pending}
            onClick={() => orderDialog.current?.showModal()}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            Create rental order
          </button>
        ) : null}
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
        {canSend && (latest.status === 'SENT' || latest.status === 'VIEWED') ? (
          <>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => void deliverAgain('resend')}
              type="button"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Resend current link
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => void deliverAgain('access/rotate')}
              type="button"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Rotate secure link
            </button>
          </>
        ) : null}
        {latest.status !== 'DRAFT' ? (
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold"
            href={`/api/quotes/${id}/revisions/${latest.id}/pdf`}
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Download PDF
          </a>
        ) : null}
        {canUpdate && latest.status !== 'ACCEPTED' ? (
          <button
            className="min-h-11 rounded-lg border px-4 py-2 font-semibold"
            onClick={() => setRevising((value) => !value)}
          >
            {revising
              ? 'Cancel editing'
              : latest.status === 'DRAFT'
                ? 'Edit draft'
                : 'Create new revision'}
          </button>
        ) : null}
      </div>
      {quote.order ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Confirmed rental order</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This accepted quote has already been converted. Creating the order
            did not reserve inventory.
          </p>
          <Link
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-4 py-2 font-semibold"
            href={`/orders/${quote.order.id}`}
          >
            View {quote.order.orderNumber}
          </Link>
        </section>
      ) : null}
      {createdOrder ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Rental order created</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Open the order to explicitly generate or manage its customer link.
          </p>
          <Link
            className="mt-3 inline-block font-semibold underline"
            href={`/orders/${createdOrder.id}`}
          >
            Open {createdOrder.orderNumber}
          </Link>
        </section>
      ) : null}
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
      {acceptedRevision ? (
        <dialog
          aria-describedby="create-order-description"
          aria-labelledby="create-order-title"
          aria-modal="true"
          className="w-[min(34rem,calc(100%-2rem))] rounded-xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/60"
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
          ref={orderDialog}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold" id="create-order-title">
                Create confirmed rental order?
              </h2>
              <p
                className="mt-2 text-sm text-muted-foreground"
                id="create-order-description"
              >
                This explicitly converts accepted revision{' '}
                {acceptedRevision.revisionNumber} for{' '}
                {cad.format(acceptedRevision.totalCents / 100)} into an
                immutable order snapshot.
              </p>
            </div>
            <button
              aria-label="Close create order dialog"
              className="rounded-lg p-2 hover:bg-muted"
              disabled={pending}
              onClick={() => orderDialog.current?.close()}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-4 rounded-lg border border-border bg-muted/50 p-4 text-sm font-medium">
            This action does not reserve inventory, calculate availability,
            assign assets, or change inventory quantities.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Quote</dt>
            <dd>{quote.quoteNumber}</dd>
            <dt className="text-muted-foreground">Rental period</dt>
            <dd>
              {new Date(quote.rentalRequest.rentalStartDate).toLocaleString()} –{' '}
              {new Date(quote.rentalRequest.rentalEndDate).toLocaleString()}
            </dd>
          </dl>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              autoFocus
              className="min-h-11 rounded-lg border px-4 py-2 font-semibold"
              disabled={pending}
              onClick={() => orderDialog.current?.close()}
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              disabled={pending}
              onClick={() => void createOrder()}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {pending ? 'Creating order...' : 'Confirm and create order'}
            </button>
          </div>
        </dialog>
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
                <dt>
                  Discount
                  {revision.discountType === 'PERCENTAGE'
                    ? ` (${(revision.discountRateBasisPoints ?? 0) / 100}%)`
                    : ''}
                </dt>
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
