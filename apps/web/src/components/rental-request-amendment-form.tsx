'use client';

import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicRentalRequestRevisionResponse } from '@mensah-rentals/types';
import {
  submitRentalRequestAmendmentSchema,
  submitRentalChangeRequestSchema,
  type SubmitRentalChangeRequestInput,
  type SubmitRentalRequestAmendmentInput,
} from '@mensah-rentals/validation';

import {
  currentRentalRequestRevision,
  submitRentalRequestAmendment,
  submitRentalChangeRequest,
} from '@/lib/rental-request-client';

type CatalogueItem = {
  categoryName: string;
  categorySlug: string;
  id: string;
  name: string;
  rentalUnit: string;
  slug: string;
};
type CatalogueApiItem = Omit<CatalogueItem, 'categoryName' | 'categorySlug'> & {
  category: { name: string; slug: string };
};
type EditItem = CatalogueItem & {
  requestedQuantity: number;
  removed?: boolean;
};

const inputClass =
  'mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RentalRequestAmendmentForm({
  mode = 'amendment',
}: {
  mode?: 'amendment' | 'change-request';
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const [current, setCurrent] =
    useState<PublicRentalRequestRevisionResponse | null>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CatalogueItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'review') reviewHeadingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    void currentRentalRequestRevision()
      .then((revision) => {
        if (mode === 'amendment' && !revision.amendmentAllowed)
          throw new Error(
            'Ordinary amendment is no longer available. Submit a formal change request instead.',
          );
        if (mode === 'change-request' && !revision.formalChangeRequestAllowed)
          throw new Error(
            'A formal change request is available only after quote acceptance or order confirmation.',
          );
        setCurrent(revision);
        setItems(
          revision.items.map((item) => ({
            categoryName: item.categoryName,
            categorySlug: item.categorySlug,
            id: item.productId ?? item.id,
            name: item.productName,
            rentalUnit: item.rentalUnit,
            slug: item.productSlug,
            requestedQuantity: item.requestedQuantity,
          })),
        );
        setValues({
          amendmentReason: '',
          companyName: revision.companyName ?? '',
          contactEmail: revision.contactEmail,
          contactFirstName: revision.contactFirstName,
          contactLastName: revision.contactLastName,
          contactPhone: revision.contactPhone,
          customerNotes: revision.customerNotes ?? '',
          deliveryAddress: revision.deliveryAddress ?? '',
          fulfillmentMethod: revision.fulfillmentMethod,
          projectLocation: revision.projectLocation,
          projectName: revision.projectName,
          projectType: revision.projectType,
          rentalEndDate: revision.rentalEndDate,
          rentalStartDate: revision.rentalStartDate,
          requestedTimeZone: revision.requestedTimeZone,
        });
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : 'This request is unavailable.',
        ),
      );
  }, [mode]);

  useEffect(() => errorRef.current?.focus(), [error]);

  async function findProducts() {
    setError(null);
    try {
      const response = await fetch(
        `/api/rental-requests/current/catalogue?search=${encodeURIComponent(search)}`,
        { cache: 'no-store' },
      );
      const body: unknown = await response.json();
      if (
        !response.ok ||
        !body ||
        typeof body !== 'object' ||
        !('items' in body) ||
        !Array.isArray(body.items)
      )
        throw new Error('The catalogue could not be searched.');
      setResults(
        (body.items as CatalogueApiItem[]).map((item) => ({
          categoryName: item.category.name,
          categorySlug: item.category.slug,
          id: item.id,
          name: item.name,
          rentalUnit: item.rentalUnit,
          slug: item.slug,
        })),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The catalogue could not be searched.',
      );
    }
  }

  function changeQuantity(id: string, amount: number) {
    setItems((all) =>
      all.map((item) =>
        item.id === id
          ? {
              ...item,
              requestedQuantity: Math.max(1, item.requestedQuantity + amount),
            }
          : item,
      ),
    );
  }

  const activeItems = useMemo(
    () => items.filter((item) => !item.removed),
    [items],
  );

  function review() {
    setError(null);
    if (!activeItems.length)
      return setError('At least one equipment item must remain.');
    const preview = buildInput(false);
    const parsed = (
      mode === 'amendment'
        ? submitRentalRequestAmendmentSchema
        : submitRentalChangeRequestSchema
    ).safeParse(preview);
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? 'Review the amendment details.',
      );
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function buildInput(
    withOperation = true,
  ): SubmitRentalRequestAmendmentInput | SubmitRentalChangeRequestInput {
    const common = {
      companyName: values.companyName || null,
      contactEmail: values.contactEmail ?? '',
      contactFirstName: values.contactFirstName ?? '',
      contactLastName: values.contactLastName ?? '',
      contactPhone: values.contactPhone ?? '',
      customerNotes: values.customerNotes || null,
      deliveryAddress: values.deliveryAddress || null,
      expectedRevisionNumber: current?.revisionNumber ?? 0,
      fulfillmentMethod: (values.fulfillmentMethod ??
        'PICKUP') as SubmitRentalRequestAmendmentInput['fulfillmentMethod'],
      items: activeItems.map((item) => ({
        productId: item.id,
        requestedQuantity: item.requestedQuantity,
      })),
      operationId: withOperation
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-000000000000',
      projectLocation: values.projectLocation ?? '',
      projectName: values.projectName ?? '',
      projectType: values.projectType ?? '',
      rentalEndDate: values.rentalEndDate ?? '',
      rentalStartDate: values.rentalStartDate ?? '',
      requestedTimeZone: values.requestedTimeZone ?? 'UTC',
    };
    return mode === 'amendment'
      ? { ...common, amendmentReason: values.amendmentReason ?? '' }
      : { ...common, reason: values.amendmentReason ?? '' };
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      if (mode === 'amendment')
        await submitRentalRequestAmendment(
          buildInput() as SubmitRentalRequestAmendmentInput,
        );
      else
        await submitRentalChangeRequest(
          buildInput() as SubmitRentalChangeRequestInput,
        );
      router.push(`/rental-requests/${current!.referenceNumber}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The request could not be submitted.',
      );
      setStep('edit');
    } finally {
      setPending(false);
    }
  }

  if (!current && !error)
    return (
      <div
        aria-busy="true"
        className="rounded-2xl border bg-card p-10 text-center"
      >
        <Loader2 className="mx-auto h-8 w-8 animate-spin" aria-hidden="true" />
        <p className="mt-3 font-semibold">Loading your request…</p>
      </div>
    );
  if (!current)
    return (
      <div
        ref={errorRef}
        tabIndex={-1}
        role="alert"
        className="rounded-2xl border bg-card p-8"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold">Amendment unavailable</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );

  if (step === 'review')
    return (
      <section className="mx-auto max-w-4xl rounded-2xl border bg-card p-4 sm:p-7">
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4"
          type="button"
          onClick={() => setStep('edit')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to edit
        </button>
        <h1
          ref={reviewHeadingRef}
          tabIndex={-1}
          className="mt-6 text-3xl font-bold outline-none"
        >
          Review your changes
        </h1>
        <div className="mt-5 rounded-xl border border-amber-600/40 bg-amber-500/10 p-4 leading-7">
          <strong>
            {mode === 'amendment'
              ? 'Your original request will not be overwritten.'
              : 'Your accepted quote or confirmed order will not be changed.'}
          </strong>{' '}
          These changes will be submitted to our team for another review.{' '}
          {mode === 'amendment'
            ? 'Earlier approvals or quotes may no longer apply.'
            : 'No replacement quote, order, or reservation is created automatically.'}
        </div>
        <h2 className="mt-7 text-xl font-semibold">
          Replacement equipment list
        </h2>
        <ul className="mt-3 divide-y rounded-xl border px-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-h-14 items-center justify-between gap-3 py-3"
            >
              <span
                className={
                  item.removed ? 'line-through text-muted-foreground' : ''
                }
              >
                {item.name}
                {item.removed ? (
                  <span className="ml-2 rounded bg-muted px-2 py-1 text-xs font-bold no-underline">
                    REMOVED
                  </span>
                ) : null}
              </span>
              <strong>{item.removed ? '—' : item.requestedQuantity}</strong>
            </li>
          ))}
        </ul>
        {error ? (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="mt-5 rounded-lg border border-destructive p-3 text-destructive"
          >
            {error}
          </div>
        ) : null}
        <button
          disabled={pending}
          onClick={() => void submit()}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60"
          type="button"
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" />
          )}
          {mode === 'amendment'
            ? 'Submit amendment'
            : 'Submit formal change request'}
        </button>
      </section>
    );

  const field = (name: string, label: string, type = 'text') => (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className={inputClass}
        type={type}
        value={values[name] ?? ''}
        onChange={(event) =>
          setValues((old) => ({ ...old, [name]: event.target.value }))
        }
      />
    </label>
  );
  return (
    <section className="mx-auto max-w-5xl space-y-7">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Request {current.referenceNumber} · Revision {current.revisionNumber}
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          {mode === 'amendment'
            ? 'Amend your rental request'
            : 'Request a formal change'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Change the complete equipment list and request details. No equipment
          is reserved by this action.
        </p>
      </div>
      {error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          {error}
        </div>
      ) : null}
      <div className="rounded-2xl border bg-card p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Equipment</h2>
        <ul aria-live="polite" className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border p-3 ${item.removed ? 'bg-muted/50' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong className={item.removed ? 'line-through' : ''}>
                    {item.name}
                  </strong>
                  <p className="text-sm text-muted-foreground">
                    {item.categoryName} · {item.rentalUnit}
                  </p>
                </div>
                {item.removed ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border px-4 font-semibold"
                    onClick={() =>
                      setItems((all) =>
                        all.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, removed: false }
                            : entry,
                        ),
                      )
                    }
                  >
                    Keep item
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      aria-label={`Decrease ${item.name} quantity`}
                      className="grid h-11 w-11 place-items-center rounded-lg border"
                      type="button"
                      onClick={() => changeQuantity(item.id, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <strong className="min-w-8 text-center">
                      {item.requestedQuantity}
                    </strong>
                    <button
                      aria-label={`Increase ${item.name} quantity`}
                      className="grid h-11 w-11 place-items-center rounded-lg border"
                      type="button"
                      onClick={() => changeQuantity(item.id, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Remove ${item.name}`}
                      className="grid h-11 w-11 place-items-center rounded-lg border text-destructive"
                      type="button"
                      onClick={() =>
                        setItems((all) =>
                          all.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, removed: true }
                              : entry,
                          ),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t pt-5">
          <label className="text-sm font-semibold" htmlFor="catalogue-search">
            Add more equipment
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="catalogue-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={inputClass.replace('mt-1 ', '')}
              placeholder="Search the active catalogue"
            />
            <button
              type="button"
              onClick={() => void findProducts()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 font-semibold"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {results.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3"
              >
                <span>{product.name}</span>
                <button
                  disabled={items.some(
                    (item) => item.id === product.id && !item.removed,
                  )}
                  type="button"
                  className="min-h-11 rounded-lg border bg-background px-4 font-semibold disabled:opacity-50"
                  onClick={() =>
                    setItems((all) =>
                      all.some((item) => item.id === product.id)
                        ? all.map((item) =>
                            item.id === product.id
                              ? { ...item, removed: false }
                              : item,
                          )
                        : [...all, { ...product, requestedQuantity: 1 }],
                    )
                  }
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid gap-5 rounded-2xl border bg-card p-4 sm:grid-cols-2 sm:p-6">
        {field('contactFirstName', 'First name')}
        {field('contactLastName', 'Last name')}
        {field('contactEmail', 'Email', 'email')}
        {field('contactPhone', 'Phone', 'tel')}
        {field('companyName', 'Company')}
        {field('projectName', 'Event or project name')}
        {field('projectType', 'Project type')}
        {field('projectLocation', 'Project location')}
        {field('rentalStartDate', 'Rental start', 'date')}
        {field('rentalEndDate', 'Rental end', 'date')}
        <label className="block text-sm font-semibold">
          Fulfillment
          <select
            className={inputClass}
            value={values.fulfillmentMethod}
            onChange={(event) =>
              setValues((old) => ({
                ...old,
                fulfillmentMethod: event.target.value,
              }))
            }
          >
            <option value="PICKUP">Pickup</option>
            <option value="DELIVERY">Delivery</option>
            <option value="DELIVERY_AND_SETUP">Delivery and setup</option>
          </select>
        </label>
        {field('deliveryAddress', 'Delivery address')}
        <label className="block text-sm font-semibold sm:col-span-2">
          Customer notes
          <textarea
            className={`${inputClass} min-h-28`}
            value={values.customerNotes}
            onChange={(event) =>
              setValues((old) => ({
                ...old,
                customerNotes: event.target.value,
              }))
            }
          />
        </label>
        <label className="block text-sm font-semibold sm:col-span-2">
          Reason for amendment
          <textarea
            required
            className={`${inputClass} min-h-28`}
            value={values.amendmentReason}
            onChange={(event) =>
              setValues((old) => ({
                ...old,
                amendmentReason: event.target.value,
              }))
            }
          />
        </label>
      </div>
      <button
        type="button"
        onClick={review}
        className="min-h-12 w-full rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
      >
        Review changes
      </button>
    </section>
  );
}
