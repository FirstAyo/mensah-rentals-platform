'use client';

import { useWorkSummary } from '@/lib/work-summary';

export function ActionableWorkBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { data } = useWorkSummary();
  const count = data?.rentalRequests?.submittedAwaitingReview ?? 0;
  if (count === 0) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <span
      aria-label={`${count} submitted rental ${count === 1 ? 'request' : 'requests'} awaiting review`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground ${compact ? 'min-w-5 px-1.5 py-0.5 text-[10px]' : 'min-w-6 px-2 py-0.5 text-xs'}`}
      title={`${count} awaiting review`}
    >
      {display}
    </span>
  );
}
