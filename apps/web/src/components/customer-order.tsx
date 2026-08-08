'use client';

import type { PublicRentalOrderResponse } from '@mensah-rentals/types';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  MapPin,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});
const money = (cents: number) => cad.format(cents / 100);
const fulfillmentLabels = {
  PICKUP: 'Customer pickup',
  DELIVERY: 'Delivery',
  DELIVERY_AND_SETUP: 'Delivery and setup',
} as const;

export function CustomerOrder() {
  const [order, setOrder] = useState<PublicRentalOrderResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/order/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = (await response.json()) as PublicRentalOrderResponse;
        if (active) setOrder(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error)
    return (
      <div
        className="rounded-2xl border border-border bg-card p-8"
        role="alert"
      >
        <h1 className="text-2xl font-bold">Order unavailable</h1>
        <p className="mt-2 text-muted-foreground">
          This private order link is unavailable or has expired. Contact Mensah
          Rentals if you need a new link.
        </p>
      </div>
    );

  if (!order)
    return (
      <p aria-live="polite" className="rounded-xl border border-border p-8">
        Loading your private rental order…
      </p>
    );

  return (
    <article className="space-y-6">
      <header className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-7">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            <span>Mensah Rentals</span>
          </div>
          <h1 className="mt-3 break-words text-3xl font-bold sm:text-4xl">
            Rental order {order.orderNumber}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Confirmed for {order.customerName}
            {order.companyName ? ` · ${order.companyName}` : ''}
          </p>
        </div>
        <span className="inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {order.customerFulfilmentStatus?.label ?? 'Confirmed'}
        </span>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            Rental period
          </h2>
          <p className="mt-3">
            {order.rentalStartDate} to {order.rentalEndDate}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmed {new Date(order.confirmedAt).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Truck className="h-5 w-5" aria-hidden="true" />
            Fulfilment
          </h2>
          <p className="mt-3">{fulfillmentLabels[order.fulfillmentMethod]}</p>
          <p className="mt-1 text-sm font-medium">
            {order.customerFulfilmentStatus?.label ?? 'Order confirmed'}
          </p>
          {order.expectedReturnDate ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Expected return date: {order.expectedReturnDate}
            </p>
          ) : null}
          {order.deliveryAddress ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{order.deliveryAddress}</span>
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Project details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Project</dt>
            <dd className="mt-1 font-medium">{order.projectName}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Type</dt>
            <dd className="mt-1 font-medium">{order.projectType}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Location</dt>
            <dd className="mt-1 font-medium">{order.projectLocation}</dd>
          </div>
        </dl>
        {order.projectNotes ? (
          <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-sm text-muted-foreground">
            {order.projectNotes}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Confirmed equipment</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {order.items.map((item, index) => (
            <div
              className="grid gap-3 border-b border-border p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              key={`${item.productSlug}-${index}`}
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.productName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.quotedQuantity} {item.rentalUnit} at{' '}
                  {money(item.unitPriceCents)} each
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                Quantity {item.quotedQuantity}
              </span>
              <span className="font-semibold">
                {money(item.lineSubtotalCents)}
              </span>
            </div>
          ))}
        </div>
      </section>
      {order.checkedOutItems?.length ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Equipment handed over</h2>
          <ul className="mt-3 space-y-2">
            {order.checkedOutItems.map((item) => (
              <li className="flex justify-between gap-4" key={item.productName}>
                <span>{item.productName}</span>
                <span>
                  {item.quantity} {item.rentalUnit}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {order.returnSummary ? (
        <section
          className="rounded-xl border bg-card p-5"
          aria-labelledby="return-status-heading"
        >
          <h2 className="text-xl font-semibold" id="return-status-heading">
            Return status
          </h2>
          <p className="mt-2 font-medium">
            {order.returnSummary.status.replaceAll('_', ' ')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.returnSummary.customerSafeMessage}
          </p>
          <p className="mt-3 text-sm">
            Accounted for: {order.returnSummary.returnedQuantity} · Remaining
            with customer: {order.returnSummary.outstandingQuantity}
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="space-y-4">
          {order.customerNotes ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Order notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {order.customerNotes}
              </p>
            </section>
          ) : null}
          {order.terms ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Terms</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{order.terms}</p>
            </section>
          ) : null}
        </div>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Order total</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Equipment</dt>
              <dd>{money(order.itemSubtotalCents)}</dd>
            </div>
            {order.charges.map((charge, index) => (
              <div
                className="flex justify-between gap-4"
                key={`${charge.type}-${index}`}
              >
                <dt>{charge.label}</dt>
                <dd>{money(charge.amountCents)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt>
                Discount
                {order.discountType === 'PERCENTAGE'
                  ? ` (${(order.discountRateBasisPoints ?? 0) / 100}%)`
                  : ''}
              </dt>
              <dd>-{money(order.discountCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>
                {order.tax.name} ({order.tax.rateBasisPoints / 100}%)
              </dt>
              <dd>{money(order.taxCents)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-3 text-lg font-bold">
              <dt>Total CAD</dt>
              <dd>{money(order.totalCents)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex gap-3">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <h2 className="font-semibold">
              {order.customerFulfilmentStatus?.label ?? 'Order confirmed'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{order.notice}</p>
          </div>
        </div>
      </section>
      <a
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-5 py-3 font-semibold"
        href="/api/order/pdf"
      >
        <FileDown className="h-4 w-4" aria-hidden="true" />
        Download order PDF
      </a>
    </article>
  );
}
