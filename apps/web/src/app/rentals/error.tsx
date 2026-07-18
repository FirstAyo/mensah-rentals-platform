'use client';
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
        className="mt-6 rounded-lg bg-primary px-5 py-3 font-semibold text-white"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
