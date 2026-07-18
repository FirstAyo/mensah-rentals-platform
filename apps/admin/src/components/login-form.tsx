'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  staffLoginSchema,
  type StaffLoginInput,
} from '@mensah-rentals/validation';
import { LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

const GENERIC_LOGIN_ERROR = 'Unable to sign in with those credentials.';

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<StaffLoginInput>({ resolver: zodResolver(staffLoginSchema) });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const response = await fetch('/api/auth/login', {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      setServerError(GENERIC_LOGIN_ERROR);
      return;
    }

    router.replace('/');
    router.refresh();
  });

  return (
    <form className="mt-8 space-y-5" noValidate onSubmit={onSubmit}>
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="email">
          Email address
        </label>
        <input
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={Boolean(errors.email)}
          autoComplete="username"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-50 outline-none transition placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
          id="email"
          placeholder="staff@example.com"
          type="email"
          {...register('email')}
        />
        {errors.email ? (
          <p className="mt-2 text-sm text-rose-400" id="email-error">
            Enter a valid staff email address.
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          aria-describedby={errors.password ? 'password-error' : undefined}
          aria-invalid={Boolean(errors.password)}
          autoComplete="current-password"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-50 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
          id="password"
          type="password"
          {...register('password')}
        />
        {errors.password ? (
          <p className="mt-2 text-sm text-rose-400" id="password-error">
            Enter your password.
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        <LockKeyhole aria-hidden="true" size={18} />
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
