import type { StaffUserResponse } from '@mensah-rentals/types';
import { ShieldCheck } from 'lucide-react';

import { LogoutButton } from './logout-button';
import { visibleAdminNavigation } from '../lib/admin-navigation';

export function AdminLanding({ user }: { user: StaffUserResponse }) {
  const navigation = visibleAdminNavigation(user.permissionKeys);
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between border-b border-slate-800 pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
            Authenticated Development Environment
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Mensah Rentals Admin
          </h1>
        </div>
        <LogoutButton />
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl gap-8 md:grid-cols-[15rem_1fr]">
        <nav
          aria-label="Development navigation"
          className="rounded-3xl border border-slate-800 bg-slate-900 p-4"
        >
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Permission-aware preview
          </p>
          <ul className="space-y-1">
            {navigation.map(({ label }) => (
              <li
                className="rounded-xl px-3 py-2.5 text-sm text-slate-300"
                key={label}
              >
                {label}
              </li>
            ))}
          </ul>
        </nav>
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <ShieldCheck aria-hidden="true" size={26} />
          </div>
          <h2 className="mt-6 text-2xl font-semibold">
            Welcome, {user.firstName} {user.lastName}
          </h2>
          <p className="mt-2 text-slate-300">{user.email}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {user.roles.length > 0 ? (
              user.roles.map((role) => (
                <span
                  className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300"
                  key={role.id}
                >
                  {role.displayName}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-400">No roles assigned</span>
            )}
          </div>
          <p className="mt-4 text-sm text-slate-400">
            {new Set(user.permissionKeys).size} effective permissions
          </p>
          <p className="mt-6 max-w-2xl leading-7 text-slate-400">
            Your staff session and permission-based access are active. These
            navigation entries are placeholders; protected API authorization
            remains the source of truth.
          </p>
        </section>
      </div>
    </main>
  );
}
