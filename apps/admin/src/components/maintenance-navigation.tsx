import { ClipboardCheck, Wrench } from 'lucide-react';
import Link from 'next/link';

export function MaintenanceNavigation({
  canViewInspections,
}: {
  canViewInspections: boolean;
}) {
  return (
    <nav
      aria-label="Maintenance sections"
      className="flex flex-wrap gap-2 border-b border-border pb-4"
    >
      <Link
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        href="/maintenance/work-orders"
      >
        <Wrench aria-hidden="true" className="h-4 w-4" /> Work orders
      </Link>
      {canViewInspections ? (
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          href="/maintenance/inspections"
        >
          <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
          Inspections
        </Link>
      ) : null}
    </nav>
  );
}
