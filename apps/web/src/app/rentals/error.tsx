'use client';
import { RefreshCw } from 'lucide-react';
export default function RentalsError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center" role="alert">
      <h1 className="text-3xl font-bold">
        The catalogue is temporarily unavailable.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Please try again. No rental request has been affected.
      </p>
      <button
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={reset}
        type="button"
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
