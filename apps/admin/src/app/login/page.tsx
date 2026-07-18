import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/login-form';
import { getCurrentStaffUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentStaffUser();
  if (user) {
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-50">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/30 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          Staff access
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Mensah Rentals Admin
        </h1>
        <p className="mt-3 leading-7 text-slate-400">
          Sign in with your internal staff account to continue.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
