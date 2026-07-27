'use client';

import type {
  AdminRentalRequestDecisionResponse,
  AdminRentalRequestDetailResponse,
} from '@mensah-rentals/types';
import {
  approveRentalRequestDecisionSchema,
  partiallyApproveRentalRequestDecisionSchema,
  rejectRentalRequestDecisionSchema,
} from '@mensah-rentals/validation';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

type Outcome = 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
type Draft = {
  customerExplanation: string;
  internalReason: string;
  items: Array<{ approvedQuantity: number; rentalRequestItemId: string }>;
};

const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function humanize(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function RentalRequestDecisionPanel({
  canApprove,
  canPartiallyApprove,
  canReject,
  onCompleted,
  request,
}: {
  canApprove: boolean;
  canPartiallyApprove: boolean;
  canReject: boolean;
  onCompleted: () => Promise<void>;
  request: AdminRentalRequestDetailResponse;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [operationIds, setOperationIds] = useState<Record<Outcome, string>>({
    APPROVED: crypto.randomUUID(),
    PARTIALLY_APPROVED: crypto.randomUUID(),
    REJECTED: crypto.randomUUID(),
  });
  const [pendingPayload, setPendingPayload] =
    useState<Record<string, unknown>>();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const form = useForm<Draft>({
    defaultValues: {
      customerExplanation: '',
      internalReason: '',
      items: request.items.map((item) => ({
        approvedQuantity: item.requestedQuantity,
        rentalRequestItemId: item.id,
      })),
    },
  });
  const decision = useQuery<AdminRentalRequestDecisionResponse | null>({
    queryKey: ['rental-request-decision', request.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/rental-requests/${request.id}/decision`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Unable to load the decision.');
      return response.json() as Promise<AdminRentalRequestDecisionResponse | null>;
    },
  });

  const terminal = ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(
    request.status,
  );

  function prepare(selected: Outcome, values: Draft) {
    if (selected === 'PARTIALLY_APPROVED') {
      const exactLines =
        values.items.length === request.items.length &&
        request.items.every(
          (item, index) => values.items[index]?.rentalRequestItemId === item.id,
        );
      if (!exactLines) {
        form.setError('root', {
          message: 'Partial approval must include every requested item once.',
        });
        return;
      }
      if (
        request.items.some(
          (item, index) =>
            values.items[index]!.approvedQuantity > item.requestedQuantity,
        )
      ) {
        form.setError('root', {
          message: 'Approved quantity cannot exceed requested quantity.',
        });
        return;
      }
      if (
        request.items.every(
          (item, index) =>
            values.items[index]!.approvedQuantity === item.requestedQuantity,
        )
      ) {
        form.setError('root', {
          message: 'Partial approval requires at least one changed quantity.',
        });
        return;
      }
      if (values.items.every((item) => item.approvedQuantity === 0)) {
        form.setError('root', {
          message:
            'Partial approval requires at least one positive approved quantity.',
        });
        return;
      }
    }
    const common = {
      customerExplanation:
        selected === 'APPROVED' && !values.customerExplanation.trim()
          ? null
          : values.customerExplanation,
      expectedReviewVersion: request.reviewVersion,
      internalReason: values.internalReason,
      operationId: operationIds[selected],
    };
    const payload =
      selected === 'PARTIALLY_APPROVED'
        ? { ...common, items: values.items }
        : common;
    const schema =
      selected === 'APPROVED'
        ? approveRentalRequestDecisionSchema
        : selected === 'PARTIALLY_APPROVED'
          ? partiallyApproveRentalRequestDecisionSchema
          : rejectRentalRequestDecisionSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      form.setError('root', {
        message: parsed.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }
    form.clearErrors('root');
    setOutcome(selected);
    setPendingPayload(parsed.data);
    dialog.current?.showModal();
  }

  async function confirm() {
    if (!outcome || !pendingPayload || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    const segment =
      outcome === 'APPROVED'
        ? 'approve'
        : outcome === 'PARTIALLY_APPROVED'
          ? 'partially-approve'
          : 'reject';
    try {
      const response = await fetch(
        `/api/rental-requests/${request.id}/decisions/${segment}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingPayload),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        setServerError(
          Array.isArray(body?.message)
            ? body.message.join(' ')
            : (body?.message ??
                (response.status === 409
                  ? 'This request changed. Your entries were kept; reload before retrying.'
                  : 'The decision could not be recorded.')),
        );
        dialog.current?.close();
        return;
      }
      setOperationIds((current) => ({
        ...current,
        [outcome]: crypto.randomUUID(),
      }));
      dialog.current?.close();
      await Promise.all([decision.refetch(), onCompleted()]);
    } catch {
      setServerError(
        'The decision could not be recorded. Your entries were kept.',
      );
      dialog.current?.close();
    } finally {
      setSubmitting(false);
    }
  }

  const recorded = decision.data;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Request decision</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        A decision is final and auditable. It does not create a quote, order,
        reservation, or inventory change.
      </p>

      {decision.isLoading ? <p className="mt-4">Loading decision…</p> : null}
      {decision.isError ? (
        <p className="mt-4 text-destructive" role="alert">
          The decision could not be loaded.
        </p>
      ) : null}
      {recorded ? (
        <div className="mt-4 space-y-3 rounded-lg bg-muted p-4">
          <p className="font-bold">{humanize(recorded.outcome)}</p>
          <p className="text-sm">Internal reason: {recorded.internalReason}</p>
          {recorded.customerExplanation ? (
            <p className="text-sm">
              Customer explanation: {recorded.customerExplanation}
            </p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {recorded.items.map((item) => (
              <li key={item.rentalRequestItemId}>
                {request.items.find(
                  (value) => value.id === item.rentalRequestItemId,
                )?.productName ?? 'Requested item'}
                : {item.approvedQuantity} approved of{' '}
                {item.requestedQuantitySnapshot} requested
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Decided by {recorded.decidedBy.firstName}{' '}
            {recorded.decidedBy.lastName}
          </p>
          <p className="font-medium">
            Quote eligibility:{' '}
            {recorded.quoteEligible ? 'Eligible' : 'Not eligible'}
          </p>
        </div>
      ) : null}

      {!terminal && request.status !== 'UNDER_REVIEW' ? (
        <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
          Start review before recording a decision.
        </p>
      ) : null}
      {!terminal &&
      request.status === 'UNDER_REVIEW' &&
      (canApprove || canPartiallyApprove || canReject) ? (
        <form className="mt-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Internal reason</span>
            <textarea
              className={`${field} min-h-24`}
              maxLength={3000}
              {...form.register('internalReason')}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Customer-safe explanation
            </span>
            <textarea
              className={`${field} min-h-24`}
              maxLength={2000}
              {...form.register('customerExplanation')}
            />
            <span className="text-xs text-muted-foreground">
              Plain customer-facing text only. Dates, times, request references,
              and event-size numbers are allowed. Do not include staff names,
              other-customer details, internal inventory counts or states, asset
              details, or internal reasoning.
            </span>
          </label>
          {canPartiallyApprove ? (
            <fieldset className="space-y-3">
              <legend className="font-semibold">
                Partial approval quantities
              </legend>
              {request.items.map((item, index) => (
                <label
                  className="grid gap-2 sm:grid-cols-[1fr_8rem]"
                  key={item.id}
                >
                  <span className="text-sm">
                    {item.productName} ({item.requestedQuantity} requested)
                  </span>
                  <input
                    className={field}
                    max={item.requestedQuantity}
                    min={0}
                    inputMode="numeric"
                    step={1}
                    type="number"
                    {...form.register(`items.${index}.approvedQuantity`, {
                      valueAsNumber: true,
                    })}
                  />
                  <input
                    type="hidden"
                    {...form.register(`items.${index}.rentalRequestItemId`)}
                  />
                </label>
              ))}
            </fieldset>
          ) : null}
          {form.formState.errors.root?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          {serverError ? (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canApprove ? (
              <button
                className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"
                onClick={form.handleSubmit((values) =>
                  prepare('APPROVED', values),
                )}
                type="button"
              >
                Approve
              </button>
            ) : null}
            {canPartiallyApprove ? (
              <button
                className="rounded-lg border px-4 py-2 font-semibold"
                onClick={form.handleSubmit((values) =>
                  prepare('PARTIALLY_APPROVED', values),
                )}
                type="button"
              >
                Partially approve
              </button>
            ) : null}
            {canReject ? (
              <button
                className="rounded-lg border border-destructive px-4 py-2 font-semibold text-destructive"
                onClick={form.handleSubmit((values) =>
                  prepare('REJECTED', values),
                )}
                type="button"
              >
                Reject
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {!terminal &&
      request.status === 'UNDER_REVIEW' &&
      !canApprove &&
      !canPartiallyApprove &&
      !canReject ? (
        <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
          You can view this review, but you do not have a decision permission.
        </p>
      ) : null}

      <dialog
        aria-describedby="decision-confirmation-description"
        aria-labelledby="decision-confirmation-title"
        className="w-[min(32rem,calc(100%-2rem))] rounded-xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        ref={dialog}
      >
        <h3 className="text-xl font-bold" id="decision-confirmation-title">
          Confirm final decision
        </h3>
        <p className="mt-3" id="decision-confirmation-description">
          Record this request as {outcome ? humanize(outcome) : ''}? This action
          cannot be edited or deleted and creates no inventory reservation,
          quote, or order.
        </p>
        <ul className="mt-4 space-y-1 rounded-lg bg-muted p-3 text-sm">
          {request.items.map((item, index) => (
            <li key={item.id}>
              {item.productName}: {item.requestedQuantity} requested,{' '}
              {outcome === 'REJECTED'
                ? 0
                : outcome === 'PARTIALLY_APPROVED'
                  ? form.getValues(`items.${index}.approvedQuantity`)
                  : item.requestedQuantity}{' '}
              approved
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end gap-3">
          <button
            autoFocus
            className="rounded-lg border px-4 py-2"
            disabled={submitting}
            onClick={() => dialog.current?.close()}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={submitting}
            onClick={() => void confirm()}
            type="button"
          >
            {submitting ? 'Recording…' : 'Confirm decision'}
          </button>
        </div>
      </dialog>
    </section>
  );
}
