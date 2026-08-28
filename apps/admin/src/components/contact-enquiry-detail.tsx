'use client';

import type {
  AdminContactEnquiryResponse,
  ContactEnquiryStatusResponse,
} from '@mensah-rentals/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { StatusBadge } from './contact-enquiry-list';

export function ContactEnquiryDetail({
  canManage,
  id,
}: {
  canManage: boolean;
  id: string;
}) {
  const [data, setData] = useState<AdminContactEnquiryResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetch(`/api/contact-enquiries/${id}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok)
            throw new Error('Contact enquiry could not be loaded.');
          setData((await response.json()) as AdminContactEnquiryResponse);
        })
        .catch((value) =>
          setMessage(
            value instanceof Error
              ? value.message
              : 'Contact enquiry could not be loaded.',
          ),
        ),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function update(status: ContactEnquiryStatusResponse) {
    if (!data || busy || status === data.status) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/contact-enquiries/${id}/status`, {
      body: JSON.stringify({ operationId: crypto.randomUUID(), status }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    const result = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (!response.ok)
      setMessage(result?.message ?? 'Status could not be updated.');
    else {
      setData(result as unknown as AdminContactEnquiryResponse);
      setMessage('Enquiry status updated.');
    }
    setBusy(false);
  }
  if (!data) return <p aria-live="polite">{message ?? 'Loading enquiry…'}</p>;
  return (
    <div className="space-y-6">
      <header>
        <Link className="text-sm underline" href="/contact-enquiries">
          Back to enquiries
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{data.referenceNumber}</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="mt-2 text-muted-foreground">
          Received {new Date(data.createdAt).toLocaleString()}
        </p>
      </header>
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <Detail label="Name" value={data.name} />
        <Detail
          label="Email"
          value={data.email}
          href={`mailto:${data.email}`}
        />
        <Detail
          label="Phone"
          value={data.phone ?? 'Not provided'}
          href={data.phone ? `tel:${data.phone}` : undefined}
        />
        <Detail label="Company" value={data.company ?? 'Not provided'} />
        <Detail
          label="Enquiry type"
          value={data.enquiryType.replaceAll('_', ' ')}
        />
        <div className="sm:col-span-2">
          <p className="text-sm text-muted-foreground">Message</p>
          <p className="mt-2 whitespace-pre-wrap leading-7">{data.message}</p>
        </div>
      </section>
      {canManage ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Update status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['NEW', 'READ', 'RESOLVED'] as const).map((status) => (
              <button
                className="min-h-11 rounded-md border px-4 text-sm font-medium disabled:opacity-50"
                disabled={busy || status === data.status}
                key={status}
                onClick={() => void update(status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {message ? <p aria-live="polite">{message}</p> : null}
    </div>
  );
}

function Detail({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      {href ? (
        <a
          className="mt-1 inline-block underline underline-offset-4"
          href={href}
        >
          {value}
        </a>
      ) : (
        <p className="mt-1 font-medium">{value}</p>
      )}
    </div>
  );
}
