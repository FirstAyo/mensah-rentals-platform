'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function TrackRequestForm() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const normalized = reference.trim().toUpperCase();

  return (
    <form
      className="mt-7 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (/^MR-\d{4}-[A-HJ-NP-Z2-9]{10}$/.test(normalized))
          router.push(`/rental-requests/${encodeURIComponent(normalized)}`);
      }}
    >
      <label className="font-semibold" htmlFor="request-reference">
        Request reference
      </label>
      <input
        autoComplete="off"
        className="min-h-12 rounded-lg border bg-background px-4 uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id="request-reference"
        onChange={(event) => setReference(event.target.value)}
        placeholder="MR-2026-XXXXXXXXXX"
        required
        value={reference}
      />
      <button
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
        type="submit"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        Track request
      </button>
      <p className="text-sm leading-6 text-muted-foreground">
        For privacy, the request is available only in the browser that submitted
        it. The reference alone does not grant access.
      </p>
    </form>
  );
}
