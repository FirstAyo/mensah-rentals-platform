'use client';

import type { AdminRentalOrderDetailResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});

const activityLabels: Record<
  AdminRentalOrderDetailResponse['activities'][number]['type'],
  string
> = {
  ORDER_CREATED: 'Order confirmed',
  ORDER_CUSTOMER_ACCESS_CREATED: 'Customer access created',
  ORDER_VIEWED: 'Customer viewed order',
};

export function RentalOrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<AdminRentalOrderDetailResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/orders/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Rental order could not be loaded.');
    setOrder((await response.json()) as AdminRentalOrderDetailResponse);
  }, [id]);

  useEffect(() => {
    void load().catch((caught) =>
      setError(
        caught instanceof Error
          ? caught.message
          : 'Rental order could not be loaded.',
      ),
    );
  }, [load]);

  if (!order)
    return (
      <p
        aria-live="polite"
        className="rounded-xl border border-border bg-card p-8"
      >
        {error ?? 'Loading rental order...'}
      </p>
    );

  return (
    <div className="space-y-7">
      <header>
        <Link
          className="text-sm text-muted-foreground underline"
          href="/orders"
        >
          Back to rental orders
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Confirmed rental order
            </p>
            <h1 className="mt-2 break-all text-3xl font-bold">
              {order.orderNumber}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Confirmed {new Date(order.confirmedAt).toLocaleString()} by{' '}
              {order.confirmedBy.firstName} {order.confirmedBy.lastName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-3 py-1.5 font-semibold">
              {order.status}
            </span>
            <span className="rounded-full border px-3 py-1.5 text-sm font-semibold">
              Inventory not reserved
            </span>
          </div>
        </div>
      </header>

      <p className="rounded-xl border bg-muted/40 p-4 font-medium">
        {order.notice}
      </p>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 xl:col-span-2">
          <h2 className="text-xl font-semibold">Customer and project</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Customer</dt>
              <dd className="font-medium">
                {order.customer.firstName} {order.customer.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Company</dt>
              <dd>{order.customer.companyName ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="break-all">{order.customer.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Phone</dt>
              <dd>{order.customer.phone}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Project</dt>
              <dd>{order.project.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Project type</dt>
              <dd>{order.project.type}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Location</dt>
              <dd>{order.project.location}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Fulfillment</dt>
              <dd>{order.fulfillmentMethod.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Rental period</dt>
              <dd>
                {new Date(order.rentalStartDate).toLocaleString()} –{' '}
                {new Date(order.rentalEndDate).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Delivery address
              </dt>
              <dd>{order.deliveryAddress ?? 'Not applicable'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Source records</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm text-muted-foreground">Rental request</dt>
              <dd>
                <Link
                  className="underline"
                  href={`/rental-requests/${order.rentalRequestId}`}
                >
                  {order.rentalRequestReference}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Accepted quote</dt>
              <dd>
                <Link className="underline" href={`/quotes/${order.quoteId}`}>
                  {order.quoteNumber}, revision {order.acceptedRevisionNumber}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Decision snapshot
              </dt>
              <dd className="break-all text-sm">
                {order.rentalRequestDecisionId}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Confirmed equipment</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Unit price</th>
                <th className="px-3 py-3 text-right">Line subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr className="border-b last:border-0" key={item.id}>
                  <td className="px-3 py-4">
                    <span className="font-medium">{item.productName}</span>
                    <span className="block text-muted-foreground">
                      {item.rentalUnit}
                    </span>
                  </td>
                  <td className="px-3 py-4">{item.quotedQuantity}</td>
                  <td className="px-3 py-4">
                    {cad.format(item.unitPriceCents / 100)}
                  </td>
                  <td className="px-3 py-4 text-right font-medium">
                    {cad.format(item.lineSubtotalCents / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Charges and total</h2>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <dt>Items</dt>
            <dd className="text-right">
              {cad.format(order.itemSubtotalCents / 100)}
            </dd>
            {order.charges.map((charge) => (
              <div className="contents" key={charge.id}>
                <dt>{charge.label}</dt>
                <dd className="text-right">
                  {cad.format(charge.amountCents / 100)}
                </dd>
              </div>
            ))}
            <dt>Discount</dt>
            <dd className="text-right">
              -{cad.format(order.discountCents / 100)}
            </dd>
            <dt>{order.tax.name}</dt>
            <dd className="text-right">{cad.format(order.taxCents / 100)}</dd>
            <dt className="border-t pt-3 font-bold">Total</dt>
            <dd className="border-t pt-3 text-right font-bold">
              {cad.format(order.totalCents / 100)} {order.currency}
            </dd>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Activity</h2>
          <ol className="mt-4 space-y-4">
            {order.activities.map((activity) => (
              <li className="border-l-2 border-border pl-4" key={activity.id}>
                <p className="font-medium">{activityLabels[activity.type]}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(activity.createdAt).toLocaleString()}
                  {activity.actor
                    ? ` · ${activity.actor.firstName} ${activity.actor.lastName}`
                    : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="grid gap-5 rounded-xl border border-border bg-card p-5 lg:grid-cols-2">
        <div>
          <h2 className="font-semibold">Customer-visible notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {order.quoteCustomerNotes ?? 'No customer-visible quote notes.'}
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Terms</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {order.terms ?? 'No terms recorded.'}
          </p>
        </div>
      </section>
    </div>
  );
}
