import { PowerOff, Settings } from 'lucide-react';
import Link from 'next/link';

export function FeatureDisabled({ label }: { label: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <PowerOff aria-hidden="true" className="h-9 w-9 text-muted-foreground" />
      <h1 className="mt-5 text-3xl font-bold tracking-tight">
        {label} is disabled
      </h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        This module is currently turned off in Settings. Existing records have
        not been deleted.
      </p>
      <Link
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
        href="/settings/features"
      >
        <Settings aria-hidden="true" className="h-4 w-4" /> Open Feature
        Settings
      </Link>
    </section>
  );
}
