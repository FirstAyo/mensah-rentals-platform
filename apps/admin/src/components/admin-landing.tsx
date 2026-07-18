import type { StaffUserResponse } from '@mensah-rentals/types';
import { ShieldCheck } from 'lucide-react';

import { LogoutButton } from './logout-button';

export function AdminLanding({ user }: { user: StaffUserResponse }) {
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

      <section className="mx-auto mt-12 max-w-5xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/20">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          <ShieldCheck aria-hidden="true" size={26} />
        </div>
        <h2 className="mt-6 text-2xl font-semibold">
          Welcome, {user.firstName} {user.lastName}
        </h2>
        <p className="mt-2 text-slate-300">{user.email}</p>
        <p className="mt-6 max-w-2xl leading-7 text-slate-400">
          Your staff session is active. Administrative business features and
          permission-based access will be introduced in later phases.
        </p>
      </section>
    </main>
  );
}
