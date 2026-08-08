'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Customer website route failed.', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-4 py-16 sm:px-6">
      <section className="w-full rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-10">
        <AlertTriangle
          aria-hidden="true"
          className="mx-auto h-10 w-10 text-amber-500"
        />
        <h1 className="mt-5 text-2xl font-semibold">
          This page is temporarily unavailable
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          We could not reach the rental service. Please wait a moment and try
          again.
        </p>
        <button
          className="mx-auto mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          onClick={reset}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Try again
        </button>
      </section>
    </main>
  );
}
