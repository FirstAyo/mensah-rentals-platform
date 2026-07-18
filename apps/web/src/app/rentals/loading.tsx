export default function Loading() {
  return (
    <div className="mx-auto max-w-[1760px] animate-pulse px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-10 w-72 rounded bg-muted" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-80 rounded-2xl bg-muted" />
        <div className="h-80 rounded-2xl bg-muted" />
        <div className="h-80 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
