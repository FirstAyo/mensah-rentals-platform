'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  submitContactEnquirySchema,
  type SubmitContactEnquiryFormInput,
  type SubmitContactEnquiryInput,
} from '@mensah-rentals/validation';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

const fieldClass =
  'mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring';

function operationId() {
  return crypto.randomUUID();
}

export function ContactEnquiryForm() {
  const [receipt, setReceipt] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<
    SubmitContactEnquiryFormInput,
    unknown,
    SubmitContactEnquiryInput
  >({
    defaultValues: {
      company: '',
      email: '',
      enquiryType: 'RENTAL_PROJECT',
      message: '',
      name: '',
      operationId: operationId(),
      phone: '',
      website: '',
    },
    resolver: zodResolver(submitContactEnquirySchema),
  });

  async function submit(values: SubmitContactEnquiryInput) {
    setServerError(null);
    setReceipt(null);
    try {
      const response = await fetch('/api/contact-enquiries', {
        body: JSON.stringify(values),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const result = (await response.json().catch(() => null)) as {
        message?: unknown;
        referenceNumber?: unknown;
      } | null;
      if (!response.ok)
        throw new Error(
          typeof result?.message === 'string'
            ? result.message
            : 'Your enquiry could not be submitted. Please try again.',
        );
      const reference =
        typeof result?.referenceNumber === 'string'
          ? result.referenceNumber
          : null;
      setReceipt(reference);
      form.reset({
        company: '',
        email: '',
        enquiryType: 'RENTAL_PROJECT',
        message: '',
        name: '',
        operationId: operationId(),
        phone: '',
        website: '',
      });
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Your enquiry could not be submitted. Please try again.',
      );
    }
  }

  return (
    <form
      className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8"
      noValidate
      onSubmit={form.handleSubmit(submit)}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Name <span aria-hidden="true">*</span>
          <input
            autoComplete="name"
            className={fieldClass}
            {...form.register('name')}
          />
          <FieldError message={form.formState.errors.name?.message} />
        </label>
        <label className="text-sm font-medium">
          Email <span aria-hidden="true">*</span>
          <input
            autoComplete="email"
            className={fieldClass}
            inputMode="email"
            type="email"
            {...form.register('email')}
          />
          <FieldError message={form.formState.errors.email?.message} />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input
            autoComplete="tel"
            className={fieldClass}
            inputMode="tel"
            type="tel"
            {...form.register('phone')}
          />
          <FieldError message={form.formState.errors.phone?.message} />
        </label>
        <label className="text-sm font-medium">
          Company
          <input
            autoComplete="organization"
            className={fieldClass}
            {...form.register('company')}
          />
          <FieldError message={form.formState.errors.company?.message} />
        </label>
        <label className="text-sm font-medium">
          Enquiry type <span aria-hidden="true">*</span>
          <select className={fieldClass} {...form.register('enquiryType')}>
            <option value="RENTAL_PROJECT">Rental or project enquiry</option>
            <option value="DELIVERY_PICKUP">Delivery or pickup</option>
            <option value="EXISTING_REQUEST">Existing rental request</option>
            <option value="GENERAL">General enquiry</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Message <span aria-hidden="true">*</span>
          <textarea
            className={`${fieldClass} min-h-36 resize-y`}
            placeholder="Tell us what you are planning and how our team can help."
            {...form.register('message')}
          />
          <FieldError message={form.formState.errors.message?.message} />
        </label>
        <label
          aria-hidden="true"
          className="absolute -left-[10000px] h-px w-px overflow-hidden"
        >
          Website
          <input
            autoComplete="off"
            tabIndex={-1}
            {...form.register('website')}
          />
        </label>
      </div>

      {receipt !== null ? (
        <div
          className="mt-6 flex gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
          role="status"
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <div>
            <p className="font-semibold">Your enquiry has been received.</p>
            <p className="mt-1 text-muted-foreground">
              Our team can review it in the secure Admin enquiry queue.
              {receipt ? ` Your reference is ${receipt}.` : ''}
            </p>
          </div>
        </div>
      ) : null}
      {serverError ? (
        <p
          className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <button
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Send aria-hidden="true" className="h-4 w-4" />
        )}
        {form.formState.isSubmitting ? 'Sending…' : 'Send enquiry'}
      </button>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Submitting this form does not reserve equipment, confirm availability,
        or create a rental order.
      </p>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="mt-1 block text-xs text-destructive" role="alert">
      {message}
    </span>
  ) : null;
}
