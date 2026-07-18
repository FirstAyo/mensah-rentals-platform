import { ShieldCheck } from 'lucide-react';
import { requireCurrentStaffUser } from '@/lib/auth-server';

export default async function DashboardFoundationPage() {
  const user = await requireCurrentStaffUser();
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:p-8">
      <ShieldCheck className="h-10 w-10 text-primary" aria-hidden="true" />
      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
        Authenticated Development Environment
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Mensah Rentals Admin</h1>
      <p className="mt-3 text-muted-foreground">
        Welcome, {user.firstName} {user.lastName}. You have{' '}
        {new Set(user.permissionKeys).size} effective permissions.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {user.roles.length ? (
          user.roles.map((role) => (
            <span
              className="rounded-full bg-muted px-3 py-1 text-sm"
              key={role.id}
            >
              {role.displayName}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">
            No roles assigned
          </span>
        )}
      </div>
    </section>
  );
}
