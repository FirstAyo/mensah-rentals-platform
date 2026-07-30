'use client';

import type {
  AdminCategoryResponse,
  AdminProductResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { AccessibleDialog } from './accessible-dialog';

type Row = AdminCategoryResponse | AdminProductResponse;

function TableView({
  canDelete,
  canUpdate,
  resource,
}: {
  canDelete: boolean;
  canUpdate: boolean;
  resource: 'categories' | 'products';
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [confirmation, setConfirmation] = useState<{
    action: 'deactivate' | 'delete';
    row: Row;
  } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();

  async function confirmMutation() {
    if (!confirmation || submitting) return;
    setSubmitting(true);
    setMutationError(null);
    const isCategory = resource === 'categories';
    const deleting = confirmation.action === 'delete';
    const url = deleting
      ? `/api/catalogue/categories/${confirmation.row.id}`
      : `/api/catalogue/${resource}/${confirmation.row.id}${isCategory ? '/deactivate' : ''}`;
    const response = await fetch(url, {
      method: deleting || !isCategory ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: deleting
        ? JSON.stringify({
            confirmDeleteProducts:
              'productCount' in confirmation.row &&
              confirmation.row.productCount > 0,
          })
        : !isCategory
          ? undefined
          : '{}',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setMutationError(
        response.status === 403
          ? 'You do not have permission to delete categories.'
          : response.status === 409
            ? (body?.message ??
              'This category changed while you were viewing it. Refresh and try again.')
            : (body?.message ?? 'This category could not be deleted.'),
      );
      setSubmitting(false);
      return;
    }
    const actionLabel = deleting ? 'deleted' : 'deactivated';
    setConfirmation(null);
    setNotice(`${confirmation.row.name} was ${actionLabel}.`);
    await queryClient.invalidateQueries({ queryKey: [resource] });
    setSubmitting(false);
  }
  const query = useQuery<PaginatedResponse<Row>>({
    queryKey: [resource, page, search],
    queryFn: async () => {
      const response = await fetch(
        `/api/catalogue/${resource}?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`,
      );
      if (!response.ok) throw new Error('Unable to load catalogue records.');
      return response.json() as Promise<PaginatedResponse<Row>>;
    },
  });
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div>
            <strong>{row.original.name}</strong>
            <div className="text-xs text-muted-foreground">
              /{row.original.slug}
            </div>
          </div>
        ),
      },
      ...(resource === 'products'
        ? ([
            {
              id: 'category',
              header: 'Category',
              cell: ({ row }: { row: { original: Row } }) =>
                'category' in row.original ? row.original.category.name : '',
            },
          ] as ColumnDef<Row>[])
        : []),
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.original.isActive ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}
          >
            {row.original.isActive ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            {canUpdate ? (
              <Link
                className="rounded-md border border-border px-2.5 py-1.5 text-sm"
                href={`/${resource}/${row.original.id}/edit`}
              >
                Edit
              </Link>
            ) : null}
            {((resource === 'categories' && canUpdate) ||
              (resource === 'products' && canDelete)) &&
            row.original.isActive ? (
              <button
                className="rounded-md border border-border px-2.5 py-1.5 text-sm"
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setMutationError(null);
                  setConfirmation({ action: 'deactivate', row: row.original });
                }}
                type="button"
              >
                Deactivate
              </button>
            ) : null}
            {resource === 'categories' && canDelete ? (
              <button
                className="rounded-md border border-destructive/50 px-2.5 py-1.5 text-sm text-destructive"
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setMutationError(null);
                  setConfirmation({ action: 'delete', row: row.original });
                }}
                type="button"
              >
                Delete
              </button>
            ) : null}
            {canUpdate && !row.original.isActive ? (
              <button
                className="rounded-md border border-border px-2.5 py-1.5 text-sm"
                onClick={async () => {
                  await fetch(
                    `/api/catalogue/${resource}/${row.original.id}/activate`,
                    { method: 'POST', body: '{}' },
                  );
                  await queryClient.invalidateQueries({ queryKey: [resource] });
                }}
                type="button"
              >
                Activate
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [canDelete, canUpdate, queryClient, resource],
  );
  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div>
      <div
        aria-live="polite"
        className="mb-3 min-h-6 text-sm text-emerald-700 dark:text-emerald-300"
      >
        {notice}
      </div>
      <label className="sr-only" htmlFor={`${resource}-search`}>
        Search
      </label>
      <input
        className="mb-4 w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2"
        id={`${resource}-search`}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        placeholder={`Search ${resource}`}
        value={search}
      />
      {query.isLoading ? (
        <div className="rounded-xl border border-border p-8 text-muted-foreground">
          Loading {resource}…
        </div>
      ) : query.isError ? (
        <div className="rounded-xl border border-border p-8" role="alert">
          Unable to load {resource}.{' '}
          <button onClick={() => query.refetch()} type="button">
            Retry
          </button>
        </div>
      ) : table.getRowModel().rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No {resource} match this view.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-muted">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th className="px-4 py-3" key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr className="border-t border-border" key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td className="px-4 py-3" key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Pagination" className="mt-4 flex items-center gap-3">
        <button
          className="rounded border border-border px-3 py-2 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
          type="button"
        >
          Previous
        </button>
        <span className="text-sm">
          Page {page} of {query.data?.meta.totalPages || 1}
        </span>
        <button
          className="rounded border border-border px-3 py-2 disabled:opacity-40"
          disabled={page >= (query.data?.meta.totalPages || 1)}
          onClick={() => setPage((value) => value + 1)}
          type="button"
        >
          Next
        </button>
      </nav>
      <AccessibleDialog
        descriptionId="catalogue-confirmation-description"
        initialFocusRef={cancelRef}
        onClose={() => {
          if (!submitting) setConfirmation(null);
        }}
        open={Boolean(confirmation)}
        returnFocusRef={triggerRef}
        titleId="catalogue-confirmation-title"
      >
        {confirmation ? (
          <div className="space-y-4 p-5 sm:p-6">
            <h2
              className="text-xl font-semibold"
              id="catalogue-confirmation-title"
            >
              {confirmation.action === 'delete'
                ? 'productCount' in confirmation.row &&
                  confirmation.row.productCount > 0
                  ? 'Delete category and products?'
                  : 'Delete this category?'
                : `Deactivate ${confirmation.row.name}?`}
            </h2>
            <div
              className="space-y-3 text-sm text-muted-foreground"
              id="catalogue-confirmation-description"
            >
              {confirmation.action === 'delete' ? (
                'productCount' in confirmation.row &&
                confirmation.row.productCount > 0 ? (
                  <>
                    <p>
                      <strong className="text-foreground">
                        {confirmation.row.name}
                      </strong>{' '}
                      contains {confirmation.row.productCount} product
                      {confirmation.row.productCount === 1 ? '' : 's'}.
                      Continuing permanently removes the category and all
                      products inside it from the active catalogue.
                    </p>
                    <p>
                      Historical rental, quote, order, inventory, fulfilment,
                      and return records will remain preserved. This action
                      cannot be undone.
                    </p>
                  </>
                ) : (
                  <p>
                    This action permanently removes the category and cannot be
                    undone.
                  </p>
                )
              ) : (
                <p>
                  Deactivation hides this record without permanently deleting
                  it.
                </p>
              )}
            </div>
            {mutationError ? (
              <p
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {mutationError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-lg border border-border px-4 py-2"
                disabled={submitting}
                onClick={() => setConfirmation(null)}
                ref={cancelRef}
                type="button"
              >
                Cancel
              </button>
              <button
                className={
                  confirmation.action === 'delete'
                    ? 'rounded-lg bg-destructive px-4 py-2 font-semibold text-destructive-foreground disabled:opacity-50'
                    : 'rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50'
                }
                disabled={submitting}
                onClick={() => void confirmMutation()}
                type="button"
              >
                {submitting
                  ? 'Working…'
                  : confirmation.action === 'delete'
                    ? 'productCount' in confirmation.row &&
                      confirmation.row.productCount > 0
                      ? 'Delete category and products'
                      : 'Delete category'
                    : 'Deactivate'}
              </button>
            </div>
          </div>
        ) : null}
      </AccessibleDialog>
    </div>
  );
}

export function CatalogueList(props: {
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  resource: 'categories' | 'products';
  title: string;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Catalogue management
          </p>
          <h1 className="text-3xl font-semibold">{props.title}</h1>
        </div>
        {props.canCreate ? (
          <Link
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-white"
            href={`/${props.resource}/new`}
          >
            Create {props.resource === 'products' ? 'product' : 'category'}
          </Link>
        ) : null}
      </div>
      <TableView {...props} />
    </QueryClientProvider>
  );
}
