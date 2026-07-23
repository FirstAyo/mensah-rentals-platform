export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-[1760px] animate-pulse px-4 py-10 motion-reduce:animate-none sm:px-6 lg:px-8"
      role="status"
    >
      <span className="sr-only">Loading rental catalogue</span>
      <div className="h-11 w-full max-w-xl rounded-xl bg-muted" />
      <div className="mt-4 h-6 w-full max-w-2xl rounded bg-muted" />
      <div className="mt-8 h-32 rounded-2xl bg-muted" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="h-80 rounded-2xl bg-muted" key={index} />
        ))}
      </div>
    </div>
  );
}
