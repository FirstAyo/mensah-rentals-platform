import type { StaffUserResponse } from '@mensah-rentals/types';
import { ThemeToggle } from '@mensah-rentals/ui';
import { Boxes, FolderTree, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from './logout-button';

const links = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  {
    href: '/products',
    icon: Boxes,
    label: 'Products',
    permission: 'product.view',
  },
  {
    href: '/categories',
    icon: FolderTree,
    label: 'Categories',
    permission: 'category.view',
  },
] as const;

export function AdminShell({
  children,
  user,
}: {
  children: ReactNode;
  user: StaffUserResponse;
}) {
  const permissions = new Set(user.permissionKeys);
  const visible = links.filter(
    (item) => !('permission' in item) || permissions.has(item.permission),
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <div className="mx-auto grid min-h-screen w-full max-w-[1760px] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-card p-5 lg:block">
          <Link className="text-xl font-bold" href="/">
            Mensah Rentals
          </Link>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Administration
          </p>
          <nav aria-label="Administrative sections" className="mt-8 space-y-1">
            {visible.map(({ href, icon: Icon, label }) => (
              <Link
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href={href}
                key={href}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav
                aria-label="Mobile administrative sections"
                className="flex gap-2 overflow-x-auto lg:hidden"
              >
                {visible.map(({ href, label }) => (
                  <Link
                    className="rounded-lg px-3 py-2 text-sm hover:bg-muted"
                    href={href}
                    key={href}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {user.firstName} {user.lastName}
                </span>
                <ThemeToggle />
                <LogoutButton />
              </div>
            </div>
          </header>
          <main className="p-4 sm:p-6 lg:p-8" id="main-content">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
