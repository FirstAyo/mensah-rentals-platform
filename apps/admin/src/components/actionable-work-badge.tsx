'use client';

import { useWorkSummary } from '@/lib/work-summary';

export function ActionableWorkBadge({
  compact = false,
  kind = 'requests',
}: {
  compact?: boolean;
  kind?:
    | 'requests'
    | 'reservations'
    | 'fulfilment'
    | 'returns'
    | 'issues'
    | 'maintenance';
}) {
  const { data } = useWorkSummary();
  const count =
    kind === 'requests'
      ? (data?.rentalRequests?.submittedAwaitingReview ?? 0)
      : kind === 'reservations'
        ? (data?.reservations?.awaitingReservation ?? 0) +
          (data?.reservations?.partiallyReserved ?? 0)
        : kind === 'fulfilment'
          ? (data?.fulfilment?.awaitingPreparation ?? 0) +
            (data?.fulfilment?.preparing ?? 0) +
            (data?.fulfilment?.readyForPickup ?? 0) +
            (data?.fulfilment?.readyForDelivery ?? 0) +
            (data?.fulfilment?.partiallyCheckedOut ?? 0)
          : kind === 'returns'
            ? (data?.returns?.partiallyReturned ?? 0) +
              (data?.returns?.awaitingReconciliation ?? 0) +
              (data?.returns?.readyToComplete ?? 0)
            : kind === 'issues'
              ? (data?.returnIssues?.unresolved ?? 0)
              : (data?.maintenance?.open ?? 0) +
                (data?.inspections?.overdue ?? 0);
  if (count === 0) return null;
  const display = count > 99 ? '99+' : String(count);
  const label =
    kind === 'requests'
      ? `${count} submitted rental ${count === 1 ? 'request' : 'requests'} awaiting review`
      : kind === 'reservations'
        ? `${count} rental ${count === 1 ? 'order requires' : 'orders require'} reservation work`
        : kind === 'fulfilment'
          ? `${count} rental ${count === 1 ? 'order requires' : 'orders require'} fulfilment work`
          : kind === 'returns'
            ? `${count} ${count === 1 ? 'return requires' : 'returns require'} reconciliation work`
            : kind === 'issues'
              ? `${count} unresolved return ${count === 1 ? 'issue' : 'issues'}`
              : `${count} maintenance ${count === 1 ? 'item requires' : 'items require'} attention`;
  return (
    <span
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground ${compact ? 'min-w-5 px-1.5 py-0.5 text-[10px]' : 'min-w-6 px-2 py-0.5 text-xs'}`}
      title={label}
    >
      {display}
    </span>
  );
}
