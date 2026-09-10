'use client';

import type {
  AdminCustomerAccessMutationResponse,
  AdminRentalOrderDetailResponse,
} from '@mensah-rentals/types';
import { Copy, FileDown, KeyRound, Link2, Send, Unlink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibleDialog } from './accessible-dialog';
import { useAdminNotifications } from './admin-notifications';
import { ReservationPanel } from './reservation-panel';
import { FulfilmentPanel } from './fulfilment-panel';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});

const activityLabels: Record<
  AdminRentalOrderDetailResponse['activities'][number]['type'],
  string
> = {
  ORDER_CREATED: 'Order confirmed',
  ORDER_ASSIGNED: 'Order assigned',
  ORDER_REASSIGNED: 'Order reassigned',
  ORDER_UNASSIGNED: 'Order unassigned',
  ORDER_CUSTOMER_ACCESS_CREATED: 'Customer access created',
  ORDER_VIEWED: 'Customer viewed order',
  ORDER_CUSTOMER_ACCESS_REVOKED: 'Customer access revoked',
  ORDER_CUSTOMER_ACCESS_ROTATED: 'Customer access rotated',
  ORDER_CUSTOMER_ACCESS_RESENT: 'Customer access resent',
};

export function RentalOrderDetail({
  canManageAccess,
  currentUserId,
  reservationPermissions,
  fulfilmentPermissions,
  workflowFeatures,
  id,
}: {
  canManageAccess: boolean;
  currentUserId: string;
  reservationPermissions: {
    canComplete: boolean;
    canCreate: boolean;
    canOverride: boolean;
    canRelease: boolean;
    canViewAvailability: boolean;
    canViewReservation: boolean;
  };
  fulfilmentPermissions: {
    canView: boolean;
    canPrepare: boolean;
    canCheckout: boolean;
    canPartialCheckout: boolean;
    canHandoff: boolean;
    canPdf: boolean;
    canViewReturn: boolean;
  };
  workflowFeatures: {
    fulfilment: boolean;
    reservations: boolean;
    returns: boolean;
  };
  id: string;
}) {
  const [order, setOrder] = useState<AdminRentalOrderDetailResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    'generate' | 'revoke' | 'rotate' | 'resend' | null
  >(null);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { notify } = useAdminNotifications();
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

  async function accessAction(
    action: 'generate' | 'revoke' | 'rotate' | 'resend',
  ) {
    if (!order || pending) return;
    setPending(true);
    setError(null);
    try {
      const suffix =
        action === 'generate' ? 'customer-access' : `customer-access/${action}`;
      const response = await fetch(`/api/orders/${id}/${suffix}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          ...(order.customerAccess.accessId
            ? { expectedAccessId: order.customerAccess.accessId }
            : {}),
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Customer access changed. Refresh and try again.'
            : 'Customer access could not be updated.',
        );
      const result =
        (await response.json()) as AdminCustomerAccessMutationResponse;
      setAccessLink(result.accessLink);
      setConfirmation(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Customer access could not be updated.',
      );
    } finally {
      setPending(false);
    }
  }

  async function assignToMe() {
    if (!order || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${id}/assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedToUserId: currentUserId,
          expectedVersion: order.assignmentVersion,
          operationId: crypto.randomUUID(),
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Order assignment changed. Refresh and try again.'
            : 'Order could not be assigned.',
        );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Assignment failed.');
    } finally {
      setPending(false);
    }
  }

  async function copyAccessLink() {
    if (!accessLink) return;
    try {
      await navigator.clipboard.writeText(accessLink);
      setCopyLabel('Copied');
      notify('success', 'Customer link copied');
      window.setTimeout(() => setCopyLabel('Copy'), 2_000);
    } catch {
      notify('error', 'Customer link could not be copied');
    }
  }

  if (!order)
    return (
      <p
        aria-live="polite"
        className="rounded-xl border border-border bg-card p-8"
      >
        {error ?? 'Loading rental order...'}
      </p>
    );

  const nextActionAvailable =
    order.nextAction === 'CREATE_RESERVATION'
      ? workflowFeatures.reservations && reservationPermissions.canCreate
      : order.nextAction === 'COMPLETE_RESERVATION'
        ? workflowFeatures.reservations && reservationPermissions.canComplete
        : order.nextAction === 'START_PREPARATION' ||
            order.nextAction === 'CONTINUE_PREPARATION'
          ? workflowFeatures.fulfilment && fulfilmentPermissions.canPrepare
          : order.nextAction === 'CHECK_OUT'
            ? workflowFeatures.fulfilment &&
              fulfilmentPermissions.canCheckout &&
              fulfilmentPermissions.canHandoff
            : order.nextAction === 'VIEW_ACTIVE_RENTAL'
              ? workflowFeatures.fulfilment && fulfilmentPermissions.canView
              : workflowFeatures.returns && fulfilmentPermissions.canViewReturn;

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
              {order.assignedTo
                ? `Assigned to ${order.assignedTo.firstName} ${order.assignedTo.lastName}`
                : 'Unassigned'}
            </span>
            {reservationPermissions.canViewReservation &&
            order.reservationStatus ? (
              <span className="rounded-full border px-3 py-1.5 text-sm font-semibold">
                Reservation: {order.reservationStatus.replaceAll('_', ' ')}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <p className="rounded-xl border bg-muted/40 p-4 font-medium">
        {order.notice}
      </p>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">Workflow progress</h2>
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Order confirmed', state: 'Complete' },
            {
              label: 'Inventory reservation',
              state: !workflowFeatures.reservations
                ? 'Feature unavailable'
                : !reservationPermissions.canViewReservation
                  ? 'Restricted'
                  : ['RESERVED', 'PARTIALLY_CONSUMED', 'CONSUMED'].includes(
                        order.reservationStatus ?? '',
                      )
                    ? 'Complete'
                    : order.reservationStatus === 'PARTIALLY_RESERVED'
                      ? order.reservationCoverageStatus ===
                        'SHORTFALL_ACKNOWLEDGED'
                        ? 'Partial — shortfall plan acknowledged'
                        : 'Partial — shortfall requires an acknowledged plan'
                      : reservationPermissions.canCreate
                        ? 'Current'
                        : 'Restricted',
            },
            {
              label: 'Preparation',
              state: !workflowFeatures.fulfilment
                ? 'Feature unavailable'
                : !fulfilmentPermissions.canView
                  ? 'Restricted'
                  : ['READY', 'PARTIALLY_CHECKED_OUT', 'CHECKED_OUT'].includes(
                        order.fulfilmentStatus,
                      )
                    ? 'Complete'
                    : !fulfilmentPermissions.canPrepare
                      ? 'Restricted'
                      : order.fulfilmentStatus === 'PREPARING'
                        ? 'Current'
                        : 'Not started',
            },
            {
              label:
                order.fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Handoff',
              state: !workflowFeatures.fulfilment
                ? 'Feature unavailable'
                : !fulfilmentPermissions.canView
                  ? 'Restricted'
                  : order.fulfilmentStatus === 'CHECKED_OUT'
                    ? 'Complete'
                    : !fulfilmentPermissions.canCheckout ||
                        !fulfilmentPermissions.canHandoff
                      ? 'Restricted'
                      : order.fulfilmentStatus === 'PARTIALLY_CHECKED_OUT'
                        ? 'Partial — checkout remains'
                        : order.fulfilmentStatus === 'READY'
                          ? 'Current'
                          : 'Not started',
            },
            {
              label: 'Return',
              state: !workflowFeatures.returns
                ? 'Feature unavailable'
                : !fulfilmentPermissions.canViewReturn
                  ? 'Restricted'
                  : order.nextAction === 'VIEW_RETURN'
                    ? 'In progress'
                    : order.nextAction === 'VIEW_ACTIVE_RENTAL'
                      ? 'Current'
                      : 'Not started',
            },
          ].map((step) => (
            <li
              className={`rounded-lg border p-3 ${step.state === 'Complete' ? 'bg-primary/10' : step.state === 'Current' || step.state === 'In progress' ? 'border-primary bg-primary/5' : 'bg-muted/30'}`}
              key={step.label}
            >
              <span className="block font-semibold">{step.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {step.state}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 font-semibold">
          {nextActionAvailable
            ? `Next action: ${order.nextAction.replaceAll('_', ' ')}`
            : 'The next operational action is unavailable with the current feature and permission settings.'}
        </p>
        {!order.assignedTo && canManageAccess ? (
          <button
            className="mt-3 min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-50"
            disabled={pending}
            onClick={() => void assignToMe()}
            type="button"
          >
            {pending ? 'Assigning…' : 'Assign to me'}
          </button>
        ) : null}
      </section>

      <ReservationPanel
        orderId={id}
        orderReservationStatus={order.reservationStatus ?? 'NOT_RESERVED'}
        permissions={reservationPermissions}
      />
      <FulfilmentPanel orderId={id} permissions={fulfilmentPermissions} />

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Private customer access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              State:{' '}
              <strong className="text-foreground">
                {order.customerAccess.state}
              </strong>
              {order.customerAccess.expiresAt
                ? ` · expires ${new Date(order.customerAccess.expiresAt).toLocaleString()}`
                : ''}
            </p>
          </div>
          {order.officialOrderFormAvailable ? (
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold"
              href={`/api/orders/${id}/pdf`}
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Download official customer Order Form
            </a>
          ) : (
            <span className="max-w-xs text-sm text-muted-foreground">
              Official Order Form is available after the first confirmed pickup
              or handoff.
            </span>
          )}
        </div>
        {canManageAccess ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {order.customerAccess.state !== 'ACTIVE' ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
                disabled={pending}
                onClick={() => setConfirmation('generate')}
                type="button"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" /> Generate
                customer link
              </button>
            ) : (
              <>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setConfirmation('resend')}
                  type="button"
                >
                  <Send className="h-4 w-4" aria-hidden="true" /> Resend current
                  link
                </button>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setConfirmation('rotate')}
                  type="button"
                >
                  <KeyRound className="h-4 w-4" aria-hidden="true" /> Rotate
                  link
                </button>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setConfirmation('revoke')}
                  type="button"
                >
                  <Unlink className="h-4 w-4" aria-hidden="true" /> Revoke link
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            You can view access status, but do not have permission to manage
            links.
          </p>
        )}
        {accessLink ? (
          <div className="mt-4 rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-semibold">
              Secure link shown for this action only
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <code className="min-w-0 flex-1 break-all rounded bg-background p-3 text-xs">
                {accessLink}
              </code>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4"
                onClick={() => void copyAccessLink()}
                type="button"
              >
                <Copy className="h-4 w-4" aria-hidden="true" /> {copyLabel}
              </button>
            </div>
          </div>
        ) : null}
      </section>

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
        <div
          aria-label="Confirmed equipment table"
          className="mt-4 overflow-x-auto"
          role="region"
          tabIndex={0}
        >
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
            <dt>
              Discount
              {order.discountType === 'PERCENTAGE'
                ? ` (${(order.discountRateBasisPoints ?? 0) / 100}%)`
                : ''}
            </dt>
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
      <AccessibleDialog
        descriptionId="order-access-confirmation-description"
        initialFocusRef={cancelRef}
        onClose={() => {
          if (!pending) setConfirmation(null);
        }}
        open={confirmation !== null}
        titleId="order-access-confirmation-title"
      >
        <div className="p-5 sm:p-6">
          <h2
            className="text-xl font-semibold"
            id="order-access-confirmation-title"
          >
            Confirm customer-access change
          </h2>
          <p
            className="mt-3 text-sm text-muted-foreground"
            id="order-access-confirmation-description"
          >
            {confirmation === 'revoke'
              ? 'This immediately makes the current customer link unusable.'
              : confirmation === 'rotate'
                ? 'This revokes the current link and issues a new one.'
                : confirmation === 'resend'
                  ? 'This records a resend without creating a new order.'
                  : 'This creates a new private customer link.'}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="min-h-11 rounded-lg border px-4 font-semibold"
              disabled={pending}
              onClick={() => setConfirmation(null)}
              ref={cancelRef}
              type="button"
            >
              Cancel
            </button>
            <button
              className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
              disabled={pending || confirmation === null}
              onClick={() => confirmation && void accessAction(confirmation)}
              type="button"
            >
              {pending ? 'Updating…' : 'Confirm change'}
            </button>
          </div>
        </div>
      </AccessibleDialog>
    </div>
  );
}
