'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type {
  AdminRentalRequestActivityResponse,
  AdminRentalRequestAssigneeResponse,
  AdminRentalRequestDetailResponse,
  AdminRentalRequestNoteResponse,
} from '@mensah-rentals/types';
import {
  createRentalRequestInternalNoteSchema,
  type CreateRentalRequestInternalNoteInput,
  unassignRentalRequestSchema,
  updateRentalRequestAssignmentSchema,
  updateRentalRequestReviewStateSchema,
} from '@mensah-rentals/validation';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  ArrowLeft,
  ClipboardCheck,
  History,
  MessageSquarePlus,
  PackageSearch,
  UserRoundCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { RentalRequestDecisionPanel } from './rental-request-decision-panel';

const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface AssignmentFormValues {
  assigneeUserId: string;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function date(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(year!, month! - 1, day!),
  );
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function failureMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(body?.message)) return body.message.join(' ');
  return body?.message ?? fallback;
}

function DetailBody({
  canAssign,
  canApprove,
  canPartiallyApprove,
  canReject,
  canUpdate,
  canViewQuantity,
  canCreateQuote,
  id,
}: {
  canAssign: boolean;
  canApprove: boolean;
  canPartiallyApprove: boolean;
  canReject: boolean;
  canUpdate: boolean;
  canViewQuantity: boolean;
  canCreateQuote: boolean;
  id: string;
}) {
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteOperationId, setNoteOperationId] = useState(() =>
    crypto.randomUUID(),
  );

  const detail = useQuery<AdminRentalRequestDetailResponse>({
    queryKey: ['rental-request-detail', id],
    queryFn: async () => {
      const response = await fetch(`/api/rental-requests/${id}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load rental request.');
      return response.json() as Promise<AdminRentalRequestDetailResponse>;
    },
  });
  const assignees = useQuery<AdminRentalRequestAssigneeResponse[]>({
    queryKey: ['rental-request-assignees'],
    enabled: canAssign,
    queryFn: async () => {
      const response = await fetch('/api/rental-requests/assignees', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load eligible staff.');
      return response.json() as Promise<AdminRentalRequestAssigneeResponse[]>;
    },
  });
  const notes = useQuery<AdminRentalRequestNoteResponse[]>({
    queryKey: ['rental-request-notes', id],
    queryFn: async () => {
      const response = await fetch(`/api/rental-requests/${id}/notes`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load internal notes.');
      return response.json() as Promise<AdminRentalRequestNoteResponse[]>;
    },
  });
  const activity = useQuery<AdminRentalRequestActivityResponse[]>({
    queryKey: ['rental-request-activity', id],
    queryFn: async () => {
      const response = await fetch(`/api/rental-requests/${id}/activity`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load request activity.');
      return response.json() as Promise<AdminRentalRequestActivityResponse[]>;
    },
  });

  const assignmentForm = useForm<AssignmentFormValues>({
    defaultValues: { assigneeUserId: '' },
  });
  const noteForm = useForm<CreateRentalRequestInternalNoteInput>({
    resolver: zodResolver(createRentalRequestInternalNoteSchema),
    defaultValues: { body: '', operationId: noteOperationId },
  });

  useEffect(() => {
    if (!detail.data) return;
    assignmentForm.reset({
      assigneeUserId: detail.data.assignedTo?.id ?? '',
    });
  }, [assignmentForm, detail.data]);

  async function refreshReviewState() {
    await Promise.all([detail.refetch(), activity.refetch()]);
  }

  async function assign(values: AssignmentFormValues) {
    if (isAssigning) return;
    const candidate = values.assigneeUserId
      ? updateRentalRequestAssignmentSchema.safeParse({
          assigneeUserId: values.assigneeUserId,
          expectedVersion: detail.data?.reviewVersion,
        })
      : unassignRentalRequestSchema.safeParse({
          expectedVersion: detail.data?.reviewVersion,
        });
    if (!candidate.success) {
      assignmentForm.setError('assigneeUserId', {
        message: 'Choose an eligible active staff member.',
      });
      return;
    }
    setIsAssigning(true);
    setMutationError(null);
    try {
      const isUnassigning = !values.assigneeUserId;
      const response = await fetch(`/api/rental-requests/${id}/assignment`, {
        method: isUnassigning ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate.data),
      });
      if (!response.ok) {
        setMutationError(
          await failureMessage(
            response,
            response.status === 409
              ? 'This request changed in another session. Refresh and try again.'
              : 'Unable to update the assignment.',
          ),
        );
        return;
      }
      await refreshReviewState();
    } catch {
      setMutationError('Unable to update the assignment. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  }

  async function startReview() {
    if (isStartingReview || !detail.data) return;
    setIsStartingReview(true);
    setMutationError(null);
    try {
      const input = updateRentalRequestReviewStateSchema.parse({
        expectedVersion: detail.data.reviewVersion,
        status: 'UNDER_REVIEW',
      });
      const response = await fetch(`/api/rental-requests/${id}/review-state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        setMutationError(
          await failureMessage(
            response,
            response.status === 409
              ? 'This request changed in another session. Refresh and try again.'
              : 'Unable to start review.',
          ),
        );
        return;
      }
      await refreshReviewState();
    } catch {
      setMutationError('Unable to start review. Please try again.');
    } finally {
      setIsStartingReview(false);
    }
  }

  async function addNote(values: CreateRentalRequestInternalNoteInput) {
    if (isAddingNote) return;
    setIsAddingNote(true);
    setMutationError(null);
    try {
      const response = await fetch(`/api/rental-requests/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        setMutationError(
          await failureMessage(response, 'Unable to add the internal note.'),
        );
        return;
      }
      const nextOperationId = crypto.randomUUID();
      setNoteOperationId(nextOperationId);
      noteForm.reset({ body: '', operationId: nextOperationId });
      await Promise.all([notes.refetch(), activity.refetch()]);
    } catch {
      setMutationError(
        'Unable to add the note. Retry to safely reuse this attempt.',
      );
    } finally {
      setIsAddingNote(false);
    }
  }

  if (detail.isLoading) {
    return (
      <div aria-live="polite" className="rounded-xl border p-8">
        Loading rental request…
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-4 rounded-xl border p-8" role="alert">
        <p>Unable to load this rental request.</p>
        <div className="flex gap-3">
          <button
            className="rounded-lg border border-border px-3 py-2 font-semibold"
            onClick={() => void detail.refetch()}
            type="button"
          >
            Try again
          </button>
          <Link className="rounded-lg border px-3 py-2" href="/rental-requests">
            Return to queue
          </Link>
        </div>
      </div>
    );
  }

  const request = detail.data;
  return (
    <div className="space-y-7">
      <header>
        <Link
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          href="/rental-requests"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to queue
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-foreground">
              {request.referenceNumber}
            </p>
            <h1 className="mt-2 text-3xl font-bold">{request.projectName}</h1>
            <p className="mt-2 text-muted-foreground">
              Submitted {dateTime(request.submittedAt)}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold">
            {humanize(request.status)}
          </span>
          {canCreateQuote &&
          (request.status === 'APPROVED' ||
            request.status === 'PARTIALLY_APPROVED') ? (
            <Link
              className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"
              href={`/rental-requests/${id}/quote`}
            >
              Create quote
            </Link>
          ) : null}
        </div>
      </header>

      {mutationError ? (
        <div
          className="rounded-lg border border-border bg-card p-4 text-foreground"
          role="alert"
        >
          {mutationError}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <h2 className="text-lg font-semibold">Customer</h2>
              <p className="mt-3">
                {request.contactFirstName} {request.contactLastName}
              </p>
              <a
                className="block break-all text-foreground underline underline-offset-4"
                href={`mailto:${request.contactEmail}`}
              >
                {request.contactEmail}
              </a>
              <a
                className="block text-foreground underline underline-offset-4"
                href={`tel:${request.contactPhone}`}
              >
                {request.contactPhone}
              </a>
              {request.companyName ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {request.companyName}
                </p>
              ) : null}
            </div>
            <div>
              <h2 className="text-lg font-semibold">Project</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{request.projectType}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Location</dt>
                  <dd>{request.projectLocation}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Rental</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Dates</dt>
                  <dd>
                    {date(request.rentalStartDate)} –{' '}
                    {date(request.rentalEndDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fulfillment</dt>
                  <dd>{humanize(request.fulfillmentMethod)}</dd>
                </div>
                {request.deliveryAddress ? (
                  <div>
                    <dt className="text-muted-foreground">Delivery address</dt>
                    <dd>{request.deliveryAddress}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            {request.customerNotes ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <h2 className="font-semibold">Customer notes</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {request.customerNotes}
                </p>
              </div>
            ) : null}
          </section>

          <section>
            <h2 className="text-xl font-semibold">Requested items</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Requested quantities and product snapshots are permanent request
              history and cannot be edited here.
            </p>
            <div className="mt-4 space-y-4">
              {request.items.map((item) => (
                <article
                  className="rounded-xl border border-border bg-card p-5"
                  key={item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.categoryName} · {item.rentalUnit}
                      </p>
                    </div>
                    <p className="rounded-lg bg-muted px-3 py-2 font-semibold">
                      Requested: {item.requestedQuantity}
                    </p>
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex items-center gap-2">
                      <PackageSearch
                        aria-hidden="true"
                        className="h-4 w-4 text-primary"
                      />
                      <h3 className="text-sm font-semibold">
                        Internal inventory context
                      </h3>
                    </div>
                    {canViewQuantity && item.inventoryContext ? (
                      <>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                          {Object.entries(item.inventoryContext.states).map(
                            ([state, quantity]) => (
                              <div
                                className="rounded-lg bg-muted/70 p-3"
                                key={state}
                              >
                                <p className="text-xs text-muted-foreground">
                                  {humanize(state)}
                                </p>
                                <p className="mt-1 text-lg font-bold">
                                  {quantity}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                          {item.inventoryContext.notice}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {canViewQuantity
                          ? 'No inventory record is linked to this request item.'
                          : 'Confidential inventory quantities require additional permission.'}
                      </p>
                    )}
                    <p className="mt-2 text-sm font-medium">
                      Reviewing this request does not reserve or change
                      inventory. Date-based booking conflicts are not yet
                      calculated.
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <UserRoundCheck
                aria-hidden="true"
                className="h-5 w-5 text-primary"
              />
              <h2 className="text-lg font-semibold">Assignment</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Assignment coordinates staff work. It does not approve the
              request.
            </p>
            {canAssign &&
            (request.status === 'SUBMITTED' ||
              request.status === 'UNDER_REVIEW') ? (
              <form
                className="mt-4 space-y-3"
                onSubmit={assignmentForm.handleSubmit(assign)}
              >
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Assigned staff</span>
                  <select
                    className={field}
                    disabled={assignees.isLoading || isAssigning}
                    {...assignmentForm.register('assigneeUserId')}
                  >
                    <option value="">Unassigned</option>
                    {assignees.data?.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.firstName} {staff.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                {assignmentForm.formState.errors.assigneeUserId ? (
                  <p className="text-sm text-destructive" role="alert">
                    {assignmentForm.formState.errors.assigneeUserId.message}
                  </p>
                ) : null}
                {assignees.isError ? (
                  <p className="text-sm" role="alert">
                    Eligible staff could not be loaded.
                  </p>
                ) : null}
                <button
                  className="w-full rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={assignees.isLoading || isAssigning}
                  type="submit"
                >
                  {isAssigning ? 'Saving…' : 'Save assignment'}
                </button>
              </form>
            ) : (
              <p className="mt-4 font-medium">
                {request.assignedTo
                  ? `${request.assignedTo.firstName} ${request.assignedTo.lastName}`
                  : 'Unassigned'}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck
                aria-hidden="true"
                className="h-5 w-5 text-primary"
              />
              <h2 className="text-lg font-semibold">Review state</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Starting review records internal progress only. It creates no
              approval, approved quantity, quote, order, or reservation.
            </p>
            {canUpdate && request.status === 'SUBMITTED' ? (
              <button
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
                disabled={isStartingReview}
                onClick={() => void startReview()}
                type="button"
              >
                {isStartingReview ? 'Starting review…' : 'Start review'}
              </button>
            ) : (
              <p className="mt-4 font-semibold">{humanize(request.status)}</p>
            )}
          </section>

          <RentalRequestDecisionPanel
            canApprove={canApprove}
            canPartiallyApprove={canPartiallyApprove}
            canReject={canReject}
            onCompleted={refreshReviewState}
            request={request}
          />
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <MessageSquarePlus
              aria-hidden="true"
              className="h-5 w-5 text-primary"
            />
            <h2 className="text-xl font-semibold">Internal notes</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Staff-only, append-only notes. These are never shown in customer
            tracking.
          </p>
          {canUpdate ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={noteForm.handleSubmit(addNote)}
            >
              <input type="hidden" {...noteForm.register('operationId')} />
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Add an internal note
                </span>
                <textarea
                  className={`${field} min-h-28 resize-y`}
                  maxLength={3000}
                  placeholder="Add relevant internal review context"
                  {...noteForm.register('body')}
                />
              </label>
              {noteForm.formState.errors.body ? (
                <p className="text-sm text-destructive" role="alert">
                  {noteForm.formState.errors.body.message}
                </p>
              ) : null}
              <button
                className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
                disabled={isAddingNote}
                type="submit"
              >
                {isAddingNote ? 'Adding note…' : 'Add note'}
              </button>
            </form>
          ) : null}
          {notes.isLoading ? (
            <p aria-live="polite" className="mt-5 text-sm">
              Loading notes…
            </p>
          ) : null}
          {notes.isError ? (
            <p className="mt-5 text-sm" role="alert">
              Internal notes could not be loaded.
            </p>
          ) : null}
          {notes.data?.length === 0 ? (
            <p className="mt-5 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              No internal notes yet.
            </p>
          ) : null}
          <div className="mt-5 space-y-3">
            {notes.data?.map((note) => (
              <article
                className="rounded-lg border border-border p-4"
                key={note.id}
              >
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {note.author.firstName} {note.author.lastName} ·{' '}
                  {dateTime(note.createdAt)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <History aria-hidden="true" className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Review activity</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Append-only history of Phase 9 review actions.
          </p>
          {activity.isLoading ? (
            <p aria-live="polite" className="mt-5 text-sm">
              Loading activity…
            </p>
          ) : null}
          {activity.isError ? (
            <p className="mt-5 text-sm" role="alert">
              Review activity could not be loaded.
            </p>
          ) : null}
          {activity.data?.length === 0 ? (
            <p className="mt-5 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              No internal review activity yet.
            </p>
          ) : null}
          <ol className="mt-5 space-y-3">
            {activity.data?.map((entry) => (
              <li className="border-l-2 border-primary pl-4" key={entry.id}>
                <p className="font-medium">{humanize(entry.type)}</p>
                {entry.previousAssignee || entry.newAssignee ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.previousAssignee
                      ? `${entry.previousAssignee.firstName} ${entry.previousAssignee.lastName}`
                      : 'Unassigned'}{' '}
                    →{' '}
                    {entry.newAssignee
                      ? `${entry.newAssignee.firstName} ${entry.newAssignee.lastName}`
                      : 'Unassigned'}
                  </p>
                ) : null}
                {entry.previousStatus || entry.newStatus ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.previousStatus
                      ? humanize(entry.previousStatus)
                      : 'Created'}{' '}
                    → {entry.newStatus ? humanize(entry.newStatus) : '—'}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.actor
                    ? `${entry.actor.firstName} ${entry.actor.lastName}`
                    : 'System'}{' '}
                  · {dateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

export function RentalRequestDetail(props: {
  canAssign: boolean;
  canApprove: boolean;
  canPartiallyApprove: boolean;
  canReject: boolean;
  canUpdate: boolean;
  canViewQuantity: boolean;
  canCreateQuote: boolean;
  id: string;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <DetailBody {...props} />
    </QueryClientProvider>
  );
}
