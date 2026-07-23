'use client';

import type {
  AdminCategoryResponse,
  AdminProductResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import {
  createCategorySchema,
  createProductSchema,
  updateCategorySchema,
  updateProductSchema,
} from '@mensah-rentals/validation';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ProductImageManager } from './product-image-manager';

interface Values {
  categoryId: string;
  description: string;
  isActive: boolean;
  isFeatured: boolean;
  name: string;
  rentalUnit: string;
  shortDescription: string;
  slug: string;
  specifications: string;
  sortOrder: number;
}
const defaults: Values = {
  categoryId: '',
  description: '',
  isActive: true,
  isFeatured: false,
  name: '',
  rentalUnit: 'each',
  shortDescription: '',
  slug: '',
  specifications: '',
  sortOrder: 0,
};

function FormBody({
  id,
  resource,
}: {
  id?: string;
  resource: 'categories' | 'products';
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<Values>({ defaultValues: defaults });
  const detail = useQuery<AdminCategoryResponse | AdminProductResponse>({
    queryKey: [resource, id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await fetch(`/api/catalogue/${resource}/${id}`);
      if (!response.ok) throw new Error('Unable to load this record.');
      return response.json() as Promise<
        AdminCategoryResponse | AdminProductResponse
      >;
    },
  });
  const categories = useQuery<PaginatedResponse<AdminCategoryResponse>>({
    queryKey: ['category-options'],
    enabled: resource === 'products',
    queryFn: async () => {
      const response = await fetch(
        '/api/catalogue/categories?page=1&pageSize=100&sortBy=name',
      );
      if (!response.ok) throw new Error('Unable to load categories.');
      return response.json() as Promise<
        PaginatedResponse<AdminCategoryResponse>
      >;
    },
  });
  useEffect(() => {
    if (!detail.data) return;
    const record = detail.data;
    reset({
      ...defaults,
      description: record.description ?? '',
      isActive: record.isActive,
      name: record.name,
      slug: record.slug,
      sortOrder: 'sortOrder' in record ? record.sortOrder : 0,
      ...('categoryId' in record
        ? {
            categoryId: record.categoryId,
            isFeatured: record.isFeatured,
            rentalUnit: record.rentalUnit,
            shortDescription: record.shortDescription,
            specifications: record.specifications
              .map((item) => `${item.label}: ${item.value}`)
              .join('\n'),
          }
        : {}),
    });
  }, [detail.data, reset]);
  const submit = handleSubmit(async (values) => {
    setError(null);
    let payload: unknown;
    if (resource === 'categories') {
      const candidate = {
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        sortOrder: Number(values.sortOrder),
        ...(id ? {} : { isActive: values.isActive }),
      };
      const parsed = (
        id ? updateCategorySchema : createCategorySchema
      ).safeParse(candidate);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Check the form.');
        return;
      }
      payload = parsed.data;
    } else {
      const specifications = values.specifications
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const split = line.indexOf(':');
          return {
            label: split >= 0 ? line.slice(0, split).trim() : line,
            value: split >= 0 ? line.slice(split + 1).trim() : '',
          };
        });
      const candidate = {
        categoryId: values.categoryId,
        name: values.name,
        slug: values.slug,
        shortDescription: values.shortDescription,
        description: values.description || null,
        rentalUnit: values.rentalUnit,
        isFeatured: values.isFeatured,
        specifications,
        ...(id ? {} : { isActive: values.isActive }),
      };
      const parsed = (id ? updateProductSchema : createProductSchema).safeParse(
        candidate,
      );
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Check the form.');
        return;
      }
      payload = parsed.data;
    }
    const response = await fetch(
      `/api/catalogue/${resource}${id ? `/${id}` : ''}`,
      {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(body?.message ?? 'Unable to save this record.');
      return;
    }
    router.push(`/${resource}`);
    router.refresh();
  });
  if (detail.isLoading)
    return (
      <div className="rounded-xl border border-border p-8">Loading record…</div>
    );
  if (detail.isError)
    return <div role="alert">Unable to load this record.</div>;
  const field =
    'w-full rounded-lg border border-border bg-background px-3 py-2 focus:ring-2 focus:ring-ring';
  return (
    <div className="max-w-4xl space-y-6">
      <form
        className="max-w-4xl space-y-5 rounded-2xl border border-border bg-card p-6"
        noValidate
        onSubmit={submit}
      >
        {error ? (
          <div
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-3"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span>Name</span>
            <input className={field} {...register('name')} />
          </label>
          <label className="space-y-2">
            <span>Slug</span>
            <input
              className={field}
              readOnly={Boolean(id)}
              {...register('slug')}
            />
          </label>
        </div>
        {resource === 'categories' ? (
          <label className="block space-y-2">
            <span>Sort order</span>
            <input
              className={field}
              min="0"
              type="number"
              {...register('sortOrder', { valueAsNumber: true })}
            />
          </label>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span>Category</span>
                <select className={field} {...register('categoryId')}>
                  <option value="">Select a category</option>
                  {categories.data?.items.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.isActive ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Rental unit</span>
                <input className={field} {...register('rentalUnit')} />
              </label>
            </div>
            <label className="block space-y-2">
              <span>Short description</span>
              <input className={field} {...register('shortDescription')} />
            </label>
            {!id ? (
              <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                Save the product first, then upload and optimize up to four
                images from its edit page.
              </p>
            ) : null}
            <label className="block space-y-2">
              <span>Specifications (one “Label: Value” per line)</span>
              <textarea
                className={field}
                rows={5}
                {...register('specifications')}
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register('isFeatured')} /> Featured
              product
            </label>
          </>
        )}
        <label className="block space-y-2">
          <span>Description</span>
          <textarea className={field} rows={7} {...register('description')} />
        </label>
        {!id ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('isActive')} /> Active and
            visible publicly
          </label>
        ) : null}
        <div className="flex gap-3">
          <button
            className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
          <button
            className="rounded-lg border border-border px-5 py-2.5"
            onClick={() => router.back()}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
      {resource === 'products' &&
      id &&
      detail.data &&
      'images' in detail.data ? (
        <ProductImageManager
          images={detail.data.images}
          productId={id}
          refresh={() => detail.refetch()}
        />
      ) : null}
    </div>
  );
}

export function CatalogueForm(props: {
  id?: string;
  resource: 'categories' | 'products';
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <FormBody {...props} />
    </QueryClientProvider>
  );
}
