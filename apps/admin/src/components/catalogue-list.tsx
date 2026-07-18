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
import { useMemo, useState } from 'react';

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
  const queryClient = useQueryClient();
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
            {canDelete && row.original.isActive ? (
              <button
                className="rounded-md border border-border px-2.5 py-1.5 text-sm"
                onClick={async () => {
                  if (!window.confirm(`Deactivate ${row.original.name}?`))
                    return;
                  await fetch(`/api/catalogue/${resource}/${row.original.id}`, {
                    method: 'DELETE',
                  });
                  await queryClient.invalidateQueries({ queryKey: [resource] });
                }}
                type="button"
              >
                Deactivate
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
