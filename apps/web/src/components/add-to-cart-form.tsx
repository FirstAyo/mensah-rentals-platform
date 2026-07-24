'use client';

import { CheckCircle2, ShoppingCart } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useCart, useSetCartItem } from '@/lib/use-cart';

export function AddToCartForm({
  productName,
  productSlug,
}: {
  productName: string;
  productSlug: string;
}) {
  const cart = useCart();
  const mutation = useSetCartItem();
  const existing = cart.data?.items.find(
    (item) => item.product.slug === productSlug,
  );
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (existing) setQuantity(existing.desiredQuantity);
  }, [existing]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      setMessage('Enter a desired quantity from 1 to 1000.');
      return;
    }
    try {
      await mutation.mutateAsync({ productSlug, desiredQuantity: quantity });
      setMessage(`${productName} quantity saved in your rental cart.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The rental cart could not be updated.',
      );
    }
  }

  return (
    <form
      className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-sm"
      onSubmit={submit}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="grid max-w-44 gap-2 text-sm font-semibold">
          Desired quantity
          <input
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            inputMode="numeric"
            max={1000}
            min={1}
            onChange={(event) => setQuantity(event.currentTarget.valueAsNumber)}
            type="number"
            value={Number.isNaN(quantity) ? '' : quantity}
          />
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
          disabled={mutation.isPending}
          type="submit"
        >
          <ShoppingCart aria-hidden="true" className="h-4 w-4" />
          {mutation.isPending
            ? 'Saving…'
            : existing
              ? 'Update cart quantity'
              : 'Add to rental cart'}
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Choose what your project needs. This technical limit is not an
        availability count, and adding an item does not reserve equipment.
      </p>
      <p
        aria-live="polite"
        className="mt-2 flex min-h-6 items-center gap-2 text-sm font-medium"
      >
        {message ? (
          <>
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-primary" />
            {message}
          </>
        ) : null}
      </p>
    </form>
  );
}
