'use client';

import type {
  AdminQuoteDetailResponse,
  AdminRentalRequestDecisionResponse,
  AdminRentalRequestDetailResponse,
} from '@mensah-rentals/types';
import {
  calculateQuoteMoney,
  parseCadToCents,
  parsePercentToBasisPoints,
  quoteRevisionInputSchema,
} from '@mensah-rentals/validation';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

type FormValues = {
  customerNotes: string;
  discount: string;
  internalNotes: string;
  taxName: string;
  taxRate: string;
  terms: string;
  validUntil: string;
};
type ChargeRow = {
  amount: string;
  key: string;
  label: string;
  taxable: boolean;
  type: 'DELIVERY' | 'PICKUP' | 'SETUP' | 'TEARDOWN' | 'LABOUR' | 'OTHER';
};
const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});
function localDateTimeInput(value: string) {
  const date = new Date(value);
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function QuoteEditor({
  onSaved,
  quoteId,
  requestId,
}: {
  onSaved?: () => Promise<void> | void;
  quoteId?: string;
  requestId: string;
}) {
  const router = useRouter();
  const [request, setRequest] =
    useState<AdminRentalRequestDetailResponse | null>(null);
  const [decision, setDecision] =
    useState<AdminRentalRequestDecisionResponse | null>(null);
  const [existing, setExisting] = useState<AdminQuoteDetailResponse | null>(
    null,
  );
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [taxable, setTaxable] = useState<Record<string, boolean>>({});
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const form = useForm<FormValues>({
    defaultValues: {
      customerNotes: '',
      discount: '0.00',
      internalNotes: '',
      taxName: 'Tax',
      taxRate: '0',
      terms: '',
      validUntil: '',
    },
  });
  const resetForm = useRef(form.reset);
  resetForm.current = form.reset;
  const saveOperation = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const watched = form.watch();

  useEffect(() => {
    let active = true;
    setReady(false);
    void Promise.all([
      fetch(`/api/rental-requests/${requestId}`, { cache: 'no-store' }).then(
        (r) => {
          if (!r.ok) throw new Error();
          return r.json() as Promise<AdminRentalRequestDetailResponse>;
        },
      ),
      fetch(`/api/rental-requests/${requestId}/decision`, {
        cache: 'no-store',
      }).then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<AdminRentalRequestDecisionResponse>;
      }),
      quoteId
        ? fetch(`/api/quotes/${quoteId}`, { cache: 'no-store' }).then((r) => {
            if (!r.ok) throw new Error();
            return r.json() as Promise<AdminQuoteDetailResponse>;
          })
        : Promise.resolve(null),
    ])
      .then(([requestBody, decisionBody, quoteBody]) => {
        if (!active) return;
        setRequest(requestBody);
        setDecision(decisionBody);
        setExisting(quoteBody);
        const latest = quoteBody?.revisions[0];
        const nextPrices: Record<string, string> = {};
        const nextQuantities: Record<string, number> = {};
        const nextTaxable: Record<string, boolean> = {};
        decisionBody.items
          .filter((item) => item.approvedQuantity > 0)
          .forEach((item) => {
            const prior = latest?.items.find(
              (candidate) =>
                candidate.decisionItemId === item.rentalRequestItemId ||
                candidate.decisionItemId === item.id,
            );
            nextPrices[item.id] = prior
              ? (prior.unitPriceCents / 100).toFixed(2)
              : '0.00';
            nextQuantities[item.id] =
              prior?.quotedQuantity ?? item.approvedQuantity;
            nextTaxable[item.id] = prior?.taxable ?? true;
          });
        setPrices(nextPrices);
        setQuantities(nextQuantities);
        setTaxable(nextTaxable);
        if (latest) {
          resetForm.current({
            customerNotes: latest.customerNotes ?? '',
            discount: (latest.discountCents / 100).toFixed(2),
            internalNotes: latest.internalNotes ?? '',
            taxName: latest.tax.name,
            taxRate: (latest.tax.rateBasisPoints / 100).toFixed(2),
            terms: latest.terms ?? '',
            validUntil: localDateTimeInput(latest.validUntil),
          });
          setCharges(
            latest.charges.map((charge) => ({
              amount: (charge.amountCents / 100).toFixed(2),
              key: crypto.randomUUID(),
              label: charge.label,
              taxable: charge.taxable,
              type: charge.type,
            })),
          );
        }
        setReady(true);
      })
      .catch(() => {
        if (active) setError('The approved request could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [quoteId, requestId]);

  const positive = useMemo(
    () => decision?.items.filter((item) => item.approvedQuantity > 0) ?? [],
    [decision],
  );
  const totals = useMemo(() => {
    try {
      const itemValues = positive.map((item) => ({
        quantity: quantities[item.id] ?? item.approvedQuantity,
        unitPriceCents: parseCadToCents(prices[item.id] ?? '')!,
        taxable: taxable[item.id] ?? true,
      }));
      if (itemValues.some((item) => item.unitPriceCents === null)) return null;
      const chargeValues = charges.map((charge) => ({
        amountCents: parseCadToCents(charge.amount)!,
        taxable: charge.taxable,
      }));
      if (chargeValues.some((charge) => charge.amountCents === null))
        return null;
      const discountCents = parseCadToCents(watched.discount);
      const rate = parsePercentToBasisPoints(watched.taxRate);
      if (discountCents === null || rate === null) return null;
      return calculateQuoteMoney({
        items: itemValues,
        charges: chargeValues,
        discountCents,
        discountTaxable: true,
        taxRateBasisPoints: rate,
      });
    } catch {
      return null;
    }
  }, [
    charges,
    positive,
    prices,
    quantities,
    taxable,
    watched.discount,
    watched.taxRate,
  ]);

  async function submit(values: FormValues) {
    if (pending || !decision) return;
    const payload = {
      ...(existing
        ? {
            expectedLatestRevisionNumber: existing.revisions[0]?.revisionNumber,
          }
        : {}),
      items: positive.map((item) => ({
        rentalRequestDecisionItemId: item.id,
        quotedQuantity: quantities[item.id],
        unitPriceCents: parseCadToCents(prices[item.id] ?? ''),
        taxable: taxable[item.id] ?? true,
      })),
      charges: charges.map((charge) => ({
        type: charge.type,
        label: charge.label,
        amountCents: parseCadToCents(charge.amount),
        taxable: charge.taxable,
      })),
      discountCents: parseCadToCents(values.discount),
      discountTaxable: true,
      tax: {
        name: values.taxName,
        rateBasisPoints: parsePercentToBasisPoints(values.taxRate),
      },
      customerNotes: values.customerNotes || null,
      internalNotes: values.internalNotes || null,
      terms: values.terms || null,
      validUntil: values.validUntil
        ? new Date(values.validUntil).toISOString()
        : '',
    };
    const fingerprint = JSON.stringify(payload);
    if (saveOperation.current?.fingerprint !== fingerprint)
      saveOperation.current = { fingerprint, id: crypto.randomUUID() };
    const candidate = quoteRevisionInputSchema.safeParse({
      operationId: saveOperation.current.id,
      ...payload,
    });
    if (!candidate.success) {
      setError(candidate.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        existing
          ? `/api/quotes/${existing.id}/revisions`
          : `/api/rental-requests/${requestId}/quotes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidate.data),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        throw new Error(
          Array.isArray(body?.message)
            ? body.message.join(' ')
            : (body?.message ??
              (response.status === 409
                ? 'The quote changed. Refresh and try again.'
                : 'Quote could not be saved.')),
        );
      }
      const body = (await response.json()) as
        | AdminQuoteDetailResponse
        | { id: string };
      if (existing && onSaved) await onSaved();
      else {
        router.push(`/quotes/${'revisions' in body ? body.id : existing!.id}`);
        router.refresh();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Quote could not be saved.',
      );
    } finally {
      setPending(false);
    }
  }
  if (!ready || !request || !decision)
    return (
      <p aria-live="polite" className="rounded-xl border p-8">
        {error ?? 'Loading approved request…'}
      </p>
    );
  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {request.referenceNumber}
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {existing ? 'Create quote revision' : 'Create custom quote'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pricing is entered by staff. Saving creates an immutable revision and
          does not reserve inventory.
        </p>
      </header>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Approved request</h2>
        <p className="mt-2">
          {request.contactFirstName} {request.contactLastName} ·{' '}
          {request.rentalStartDate} to {request.rentalEndDate}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Equipment pricing</h2>
        {positive.map((decisionItem) => {
          const item = request.items.find(
            (candidate) => candidate.id === decisionItem.rentalRequestItemId,
          )!;
          return (
            <article
              className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_9rem_11rem_auto] md:items-end"
              key={decisionItem.id}
            >
              <div>
                <p className="font-semibold">{item.productName}</p>
                <p className="text-sm text-muted-foreground">
                  Approved: {decisionItem.approvedQuantity} {item.rentalUnit}
                </p>
              </div>
              <label>
                <span className="text-sm">Quoted quantity</span>
                <input
                  className={field}
                  max={decisionItem.approvedQuantity}
                  min="1"
                  onChange={(event) =>
                    setQuantities((old) => ({
                      ...old,
                      [decisionItem.id]: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={
                    quantities[decisionItem.id] ?? decisionItem.approvedQuantity
                  }
                />
              </label>
              <label>
                <span className="text-sm">Unit price (CAD)</span>
                <input
                  className={field}
                  inputMode="decimal"
                  onChange={(event) =>
                    setPrices((old) => ({
                      ...old,
                      [decisionItem.id]: event.target.value,
                    }))
                  }
                  value={prices[decisionItem.id] ?? ''}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  checked={taxable[decisionItem.id] ?? true}
                  onChange={(event) =>
                    setTaxable((old) => ({
                      ...old,
                      [decisionItem.id]: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />{' '}
                Taxable
              </label>
            </article>
          );
        })}
      </section>
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Additional charges</h2>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3"
            onClick={() =>
              setCharges((rows) => [
                ...rows,
                {
                  amount: '0.00',
                  key: crypto.randomUUID(),
                  label: '',
                  taxable: true,
                  type: 'OTHER',
                },
              ])
            }
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add charge
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {charges.map((charge, index) => (
            <div
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_1fr_9rem_auto_auto] sm:items-end"
              key={charge.key}
            >
              <label>
                <span className="text-sm">Type</span>
                <select
                  className={field}
                  onChange={(e) =>
                    setCharges((rows) =>
                      rows.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              type: e.target.value as ChargeRow['type'],
                            }
                          : row,
                      ),
                    )
                  }
                  value={charge.type}
                >
                  {[
                    'DELIVERY',
                    'PICKUP',
                    'SETUP',
                    'TEARDOWN',
                    'LABOUR',
                    'OTHER',
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-sm">Customer label</span>
                <input
                  className={field}
                  maxLength={100}
                  onChange={(e) =>
                    setCharges((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, label: e.target.value } : row,
                      ),
                    )
                  }
                  value={charge.label}
                />
              </label>
              <label>
                <span className="text-sm">Amount (CAD)</span>
                <input
                  className={field}
                  inputMode="decimal"
                  onChange={(e) =>
                    setCharges((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, amount: e.target.value } : row,
                      ),
                    )
                  }
                  value={charge.amount}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  checked={charge.taxable}
                  onChange={(e) =>
                    setCharges((rows) =>
                      rows.map((row, i) =>
                        i === index
                          ? { ...row, taxable: e.target.checked }
                          : row,
                      ),
                    )
                  }
                  type="checkbox"
                />
                Taxable
              </label>
              <button
                aria-label={`Remove ${charge.label || 'charge'}`}
                className="min-h-11 rounded-lg border px-3"
                onClick={() =>
                  setCharges((rows) => rows.filter((_, i) => i !== index))
                }
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
        <label>
          <span className="text-sm">Discount (CAD)</span>
          <input
            className={field}
            inputMode="decimal"
            {...form.register('discount')}
          />
        </label>
        <label>
          <span className="text-sm">Tax name</span>
          <input className={field} {...form.register('taxName')} />
        </label>
        <label>
          <span className="text-sm">Tax rate (%)</span>
          <input
            className={field}
            inputMode="decimal"
            {...form.register('taxRate')}
          />
        </label>
        <label className="sm:col-span-3">
          <span className="text-sm">
            Valid until (shown as an exact local time)
          </span>
          <input
            className={field}
            type="datetime-local"
            {...form.register('validUntil')}
          />
        </label>
        <label className="sm:col-span-3">
          <span className="text-sm">Customer notes</span>
          <textarea className={field} {...form.register('customerNotes')} />
        </label>
        <label className="sm:col-span-3">
          <span className="text-sm">Terms</span>
          <textarea className={field} {...form.register('terms')} />
        </label>
        <label className="sm:col-span-3">
          <span className="text-sm">
            Internal notes (never shown to customer)
          </span>
          <textarea className={field} {...form.register('internalNotes')} />
        </label>
      </section>
      <section className="rounded-xl border bg-muted/40 p-5">
        <h2 className="text-xl font-semibold">Exact preview</h2>
        {totals ? (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <dt>Subtotal</dt>
            <dd>{cad.format(Number(totals.subtotalCents) / 100)}</dd>
            <dt>Discount</dt>
            <dd>
              -
              {cad.format(Number(parseCadToCents(watched.discount) ?? 0) / 100)}
            </dd>
            <dt>Tax</dt>
            <dd>{cad.format(Number(totals.taxCents) / 100)}</dd>
            <dt className="font-bold">Total</dt>
            <dd className="font-bold">
              {cad.format(Number(totals.totalCents) / 100)}
            </dd>
          </dl>
        ) : (
          <p className="mt-2" role="alert">
            Enter valid bounded money and tax values to see the preview.
          </p>
        )}
      </section>
      {error ? (
        <p className="rounded-lg border p-4" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="min-h-11 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        disabled={pending || !totals}
        type="submit"
      >
        {pending
          ? 'Saving immutable revision…'
          : existing
            ? 'Create immutable revision'
            : 'Create draft quote'}
      </button>
    </form>
  );
}
