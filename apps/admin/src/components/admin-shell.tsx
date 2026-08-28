import type {
  AdminFeatureAvailabilityResponse,
  PlatformFeatureKey,
  StaffUserResponse,
} from '@mensah-rentals/types';
import { ThemeToggle } from '@mensah-rentals/ui';
import {
  Boxes,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  Warehouse,
  FileText,
  ShoppingBag,
  GitPullRequestArrow,
  Clock3,
  RotateCcw,
  TriangleAlert,
  PanelsTopLeft,
  Wrench,
  BarChart3,
  History,
  Activity,
  Settings,
  MessagesSquare,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from './logout-button';
import { ActionableWorkBadge } from './actionable-work-badge';
import { MobileAdminNavigation } from './mobile-admin-navigation';

const links = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  {
    href: '/contact-enquiries',
    icon: MessagesSquare,
    label: 'Contact Enquiries',
    permission: 'contact_enquiry.view',
  },
  {
    href: '/website/homepage',
    icon: PanelsTopLeft,
    label: 'Website Content',
    permission: 'homepage.view',
  },
  {
    href: '/products',
    icon: Boxes,
    label: 'Products',
    permission: 'product.view',
  },
  {
    href: '/inventory',
    icon: Warehouse,
    label: 'Inventory',
    permission: 'inventory.view',
    feature: 'INVENTORY_TRACKING',
  },
  {
    href: '/rental-requests',
    icon: ClipboardList,
    label: 'Rental Requests',
    permission: 'rental_request.view',
    feature: 'RENTAL_REQUESTS',
  },
  {
    href: '/quotes',
    icon: FileText,
    label: 'Quotes',
    permission: 'quote.view',
    feature: 'QUOTES_AND_ORDERS',
  },
  {
    href: '/change-requests',
    icon: GitPullRequestArrow,
    label: 'Change Requests',
    permission: 'rental_change_request.view',
    feature: 'QUOTES_AND_ORDERS',
  },
  {
    href: '/orders',
    icon: ShoppingBag,
    label: 'Rental Orders',
    permission: 'order.view',
    feature: 'QUOTES_AND_ORDERS',
  },
  {
    href: '/active-rentals',
    icon: Clock3,
    label: 'Active Rentals',
    permission: 'active_rental.view',
    feature: 'FULFILMENT',
  },
  {
    href: '/returns',
    icon: RotateCcw,
    label: 'Returns',
    permission: 'return.view',
    feature: 'RETURNS',
  },
  {
    href: '/issues',
    icon: TriangleAlert,
    label: 'Return Issues',
    permission: 'rental_issue.view',
    feature: 'DAMAGED_RETURN_HANDLING',
  },
  {
    href: '/maintenance/work-orders',
    icon: Wrench,
    label: 'Maintenance',
    permission: 'maintenance.view',
    feature: 'MAINTENANCE',
  },
  {
    href: '/categories',
    icon: FolderTree,
    label: 'Categories',
    permission: 'category.view',
  },
  {
    href: '/reports',
    icon: BarChart3,
    label: 'Reports',
    permission: 'report.view',
    feature: 'OPERATIONAL_REPORTING',
  },
  {
    href: '/settings/features',
    icon: Settings,
    label: 'Settings',
    permission: 'feature_settings.view',
  },
  {
    href: '/reports/audit',
    icon: History,
    label: 'Audit History',
    permission: 'audit_log.view',
  },
  {
    href: '/system/status',
    icon: Activity,
    label: 'System Status',
    permission: 'observability.view',
  },
] as const;

export function AdminShell({
  children,
  featureAvailability,
  user,
}: {
  children: ReactNode;
  featureAvailability?: AdminFeatureAvailabilityResponse;
  user: StaffUserResponse;
}) {
  const permissions = new Set(user.permissionKeys);
  const features = new Map(
    featureAvailability?.features.map((feature) => [feature.key, feature]) ??
      [],
  );
  const visible = links.filter(
    (item) =>
      (!('permission' in item) || permissions.has(item.permission)) &&
      (!('feature' in item) ||
        (features.get(item.feature as PlatformFeatureKey)?.available ?? false)),
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <div className="min-h-screen w-full min-w-0">
        <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-[17rem] flex-col border-r border-border bg-card lg:flex">
          <div className="shrink-0 p-5 pb-3">
            <Link className="text-xl font-bold" href="/">
              Mensah Rentals
            </Link>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Administration
            </p>
          </div>
          <nav
            aria-label="Administrative sections"
            className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-5 pt-4"
          >
            {visible.map(({ href, icon: Icon, label, ...item }) => (
              <Link
                className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href={href}
                key={href}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {'feature' in item &&
                features.get(item.feature as PlatformFeatureKey)?.testing ? (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                    Testing
                  </span>
                ) : null}
                {href === '/rental-requests' ? <ActionableWorkBadge /> : null}
                {href === '/orders' &&
                permissions.has('inventory.reservation.view') ? (
                  <ActionableWorkBadge kind="reservations" />
                ) : null}
                {href === '/active-rentals' &&
                permissions.has('fulfilment.view') ? (
                  <ActionableWorkBadge kind="fulfilment" />
                ) : null}
                {href === '/returns' ? (
                  <ActionableWorkBadge kind="returns" />
                ) : null}
                {href === '/issues' ? (
                  <ActionableWorkBadge kind="issues" />
                ) : null}
                {href === '/maintenance/work-orders' ? (
                  <ActionableWorkBadge kind="maintenance" />
                ) : null}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 lg:pl-[17rem]">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MobileAdminNavigation
                links={visible.map(({ href, label, ...item }) => ({
                  href,
                  label,
                  testing:
                    'feature' in item &&
                    Boolean(
                      features.get(item.feature as PlatformFeatureKey)?.testing,
                    ),
                }))}
              />
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {user.firstName} {user.lastName}
                </span>
                <ThemeToggle />
                <LogoutButton />
              </div>
            </div>
          </header>
          <main
            className="min-w-0 overflow-x-clip p-4 sm:p-6 lg:p-8"
            id="main-content"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
