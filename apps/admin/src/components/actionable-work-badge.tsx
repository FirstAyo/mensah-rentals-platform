'use client';

import { useWorkSummary } from '@/lib/work-summary';

export function ActionableWorkBadge({
  compact = false,
  kind = 'requests',
}: {
  compact?: boolean;
  kind?: 'requests' | 'reservations' | 'fulfilment';
}) {
  const { data } = useWorkSummary();
  const count =
    kind === 'requests'
      ? (data?.rentalRequests?.submittedAwaitingReview ?? 0)
      : kind === 'reservations'
        ? (data?.reservations?.awaitingReservation ?? 0) +
          (data?.reservations?.partiallyReserved ?? 0)
        : (data?.fulfilment?.awaitingPreparation ?? 0) +
          (data?.fulfilment?.preparing ?? 0) +
          (data?.fulfilment?.readyForPickup ?? 0) +
          (data?.fulfilment?.readyForDelivery ?? 0) +
          (data?.fulfilment?.partiallyCheckedOut ?? 0);
  if (count === 0) return null;
  const display = count > 99 ? '99+' : String(count);
  const label =
    kind === 'requests'
      ? `${count} submitted rental ${count === 1 ? 'request' : 'requests'} awaiting review`
      : kind === 'reservations'
        ? `${count} rental ${count === 1 ? 'order requires' : 'orders require'} reservation work`
        : `${count} rental ${count === 1 ? 'order requires' : 'orders require'} fulfilment work`;
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
