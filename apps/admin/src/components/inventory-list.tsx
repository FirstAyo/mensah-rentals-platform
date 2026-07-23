'use client';

import type {
  AdminInventoryMetadataResponse,
  AdminInventoryQuantityResponse,
  AdminProductResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { Plus, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

function Quantity({ id }: { id: string }) {
  const result = useQuery<AdminInventoryQuantityResponse>({
    queryKey: ['inventory-quantity', id],
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${id}/quantities`);
      if (!response.ok) throw new Error('Quantity unavailable');
      return response.json() as Promise<AdminInventoryQuantityResponse>;
    },
  });
  if (result.isLoading) return <span>Loading…</span>;
  if (!result.data)
    return <span className="text-muted-foreground">Unavailable</span>;
  return <span className="font-semibold">{result.data.totalQuantity}</span>;
}

function InventoryListBody({
  canAdjust,
  canViewQuantity,
}: {
  canAdjust: boolean;
  canViewQuantity: boolean;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [productId, setProductId] = useState('');
  const [trackingMode, setTrackingMode] = useState<'BULK' | 'SERIALIZED'>(
    'BULK',
  );
  const [quantity, setQuantity] = useState(1);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inventory = useQuery<PaginatedResponse<AdminInventoryMetadataResponse>>(
    {
      queryKey: ['inventory', page, search],
      queryFn: async () => {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: '20',
        });
        if (search) query.set('search', search);
        const response = await fetch(`/api/inventory?${query}`);
        if (!response.ok) throw new Error('Unable to load inventory.');
        return response.json() as Promise<
          PaginatedResponse<AdminInventoryMetadataResponse>
        >;
      },
    },
  );
  const products = useQuery<PaginatedResponse<AdminProductResponse>>({
    queryKey: ['inventory-product-options'],
    enabled: showCreate,
    queryFn: async () => {
      const response = await fetch(
        '/api/catalogue/products?page=1&pageSize=100',
      );
      if (!response.ok) throw new Error('Unable to load products.');
      return response.json() as Promise<
        PaginatedResponse<AdminProductResponse>
      >;
    },
  });
  async function create() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          trackingMode,
          ...(trackingMode === 'BULK' ? { initialQuantity: quantity } : {}),
          initialState: 'RENTABLE',
          operationId,
          reason: 'Initial inventory setup',
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(result?.message ?? 'Unable to create inventory.');
        return;
      }
      setOperationId(crypto.randomUUID());
      setShowCreate(false);
      setProductId('');
      await inventory.refetch();
    } catch {
      setError(
        'Unable to create inventory. Retry to safely reuse this attempt.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="mt-1 text-muted-foreground">
            Confidential operational inventory records.
          </p>
        </div>
        {canAdjust && canViewQuantity ? (
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"
            onClick={() => {
              setOperationId(crypto.randomUUID());
              setShowCreate((value) => !value);
            }}
            type="button"
          >
            <Plus className="h-4 w-4" /> Create inventory
          </button>
        ) : null}
      </div>
      {showCreate ? (
        <section className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
          <label className="space-y-2">
            <span>Product</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              onChange={(event) => {
                setOperationId(crypto.randomUUID());
                setProductId(event.target.value);
              }}
              value={productId}
            >
              <option value="">Select product</option>
              {products.data?.items.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span>Tracking</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              onChange={(event) => {
                setOperationId(crypto.randomUUID());
                setTrackingMode(event.target.value as 'BULK' | 'SERIALIZED');
              }}
              value={trackingMode}
            >
              <option value="BULK">Bulk quantity</option>
              <option value="SERIALIZED">Serialized assets</option>
            </select>
          </label>
          {trackingMode === 'BULK' ? (
            <label className="space-y-2">
              <span>Initial rentable quantity</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                min="1"
                onChange={(event) => {
                  setOperationId(crypto.randomUUID());
                  setQuantity(Number(event.target.value));
                }}
                type="number"
                value={quantity}
              />
            </label>
          ) : (
            <div className="text-sm text-muted-foreground">
              Assets are added individually after creation.
            </div>
          )}
          {error ? (
            <p className="text-destructive md:col-span-3">{error}</p>
          ) : null}
          <button
            className="w-fit rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground md:col-span-3"
            disabled={!productId || isSubmitting}
            onClick={() => void create()}
            type="button"
          >
            {isSubmitting ? 'Savingâ€¦' : 'Save inventory'}
          </button>
        </section>
      ) : null}
      <input
        aria-label="Search inventory"
        className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2"
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        placeholder="Search products"
        value={search}
      />
      {inventory.isLoading ? (
        <div className="rounded-xl border p-8">Loading inventory…</div>
      ) : null}
      {inventory.isError ? (
        <div role="alert">Unable to load inventory.</div>
      ) : null}
      {inventory.data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Warehouse className="mx-auto h-8 w-8" />
          <p className="mt-3">No inventory records yet.</p>
        </div>
      ) : null}
      {inventory.data?.items.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[700px] text-left">
            <thead className="bg-muted/60">
              <tr>
                <th className="p-4">Product</th>
                <th className="p-4">Tracking</th>
                {canViewQuantity ? <th className="p-4">Total</th> : null}
                <th className="p-4">Updated</th>
                <th className="p-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {inventory.data.items.map((item) => (
                <tr className="border-t border-border" key={item.id}>
                  <td className="p-4 font-medium">{item.product.name}</td>
                  <td className="p-4">{item.trackingMode}</td>
                  {canViewQuantity ? (
                    <td className="p-4">
                      <Quantity id={item.id} />
                    </td>
                  ) : null}
                  <td className="p-4">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      className="text-primary underline"
                      href={`/inventory/${item.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {inventory.data && inventory.data.meta.totalPages > 1 ? (
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-2"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <button
            className="rounded border px-3 py-2"
            disabled={page >= inventory.data.meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function InventoryList(props: {
  canAdjust: boolean;
  canViewQuantity: boolean;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <InventoryListBody {...props} />
    </QueryClientProvider>
  );
}
