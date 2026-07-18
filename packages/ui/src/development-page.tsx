interface DevelopmentPageProps {
  eyebrow: string;
  title: string;
}

export function DevelopmentPage({ eyebrow, title }: DevelopmentPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-10 shadow-2xl shadow-black/20 sm:p-16">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
          {eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          {title}
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-300">
          The local foundation is running. Business workflows will be added in
          later, reviewable phases.
        </p>
      </section>
    </main>
  );
}
