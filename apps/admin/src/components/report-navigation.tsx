import Link from 'next/link';
import type { ReportKey } from '@/lib/reporting-types';

const links = [
  ['/reports', 'Overview'],
  ['/reports/rental-requests', 'Rental requests'],
  ['/reports/quotes-orders', 'Quotes & orders'],
  ['/reports/rentals-returns', 'Rentals & returns'],
  ['/reports/inventory', 'Inventory'],
  ['/reports/maintenance', 'Maintenance'],
] as const;

export function ReportNavigation({
  canViewAudit,
  availableReportKeys = [],
}: {
  canViewAudit: boolean;
  availableReportKeys?: readonly ReportKey[];
}) {
  return (
    <nav aria-label="Report sections" className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {links
          .filter(([href]) =>
            availableReportKeys.includes(
              (href === '/reports'
                ? 'overview'
                : href.replace('/reports/', '')) as ReportKey,
            ),
          )
          .map(([href, label]) => (
            <Link
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        {canViewAudit ? (
          <Link
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            href="/reports/audit"
          >
            Audit history
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
