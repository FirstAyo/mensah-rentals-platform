import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/login-form';
import {
  AdminApiUnavailableError,
  getCurrentStaffUser,
} from '@/lib/auth-server';
import { ThemeToggle } from '@mensah-rentals/ui';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  let apiUnavailable = false;
  let user: Awaited<ReturnType<typeof getCurrentStaffUser>> = null;
  try {
    user = await getCurrentStaffUser();
  } catch (error) {
    if (!(error instanceof AdminApiUnavailableError)) throw error;
    apiUnavailable = true;
  }
  if (user) {
    redirect('/');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <ThemeToggle className="absolute right-6 top-6" />
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
          Staff access
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Mensah Rentals Admin
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Sign in with your internal staff account to continue.
        </p>
        {apiUnavailable ? (
          <p
            className="mt-5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm"
            role="alert"
          >
            The Admin API is not available yet. Start it, wait for the health
            check to succeed, then try again.
          </p>
        ) : null}
        <LoginForm />
      </section>
    </main>
  );
}
