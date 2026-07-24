'use client';

import type { PublicCartItemResponse } from '@mensah-rentals/types';
import {
  AlertCircle,
  ImageIcon,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  useCart,
  useClearCart,
  useRemoveCartItem,
  useSetCartItem,
} from '@/lib/use-cart';

function CartLine({ item }: { item: PublicCartItemResponse }) {
  const update = useSetCartItem();
  const remove = useRemoveCartItem();
  const [quantity, setQuantity] = useState(item.desiredQuantity);
  const [message, setMessage] = useState('');

  useEffect(() => setQuantity(item.desiredQuantity), [item.desiredQuantity]);

  async function save(next: number) {
    if (!Number.isInteger(next) || next < 1 || next > 1000) {
      setMessage('Enter a desired quantity from 1 to 1000.');
      return;
    }
    setQuantity(next);
    setMessage('');
    try {
      await update.mutateAsync({
        productSlug: item.product.slug,
        desiredQuantity: next,
      });
      setMessage(`${item.product.name} quantity updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await save(quantity);
  }

  return (
    <li className="grid gap-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[9rem_minmax(0,1fr)_auto] lg:items-center">
      <Link
        className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={`/rentals/${item.product.category.slug}/${item.product.slug}`}
      >
        {item.product.image ? (
          <Image
            alt={item.product.image.altText}
            className="object-cover"
            fill
            sizes="144px"
            src={item.product.image.url}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon aria-hidden="true" className="h-7 w-7" />
          </span>
        )}
      </Link>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {item.product.category.name}
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          <Link
            className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/rentals/${item.product.category.slug}/${item.product.slug}`}
          >
            {item.product.name}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rental unit: {item.product.rentalUnit}
        </p>
        {!item.product.requestable ? (
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
            <AlertCircle aria-hidden="true" className="h-4 w-4" />
            No longer listed. Remove this item before a future request.
          </p>
        ) : null}
      </div>
      <form className="grid gap-3" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease desired quantity for ${item.product.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            disabled={
              !item.product.requestable || quantity <= 1 || update.isPending
            }
            onClick={() => void save(quantity - 1)}
            type="button"
          >
            <Minus aria-hidden="true" className="h-4 w-4" />
          </button>
          <label className="sr-only" htmlFor={`quantity-${item.product.slug}`}>
            Desired quantity for {item.product.name}
          </label>
          <input
            className="h-11 w-20 rounded-lg border border-border bg-background px-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={!item.product.requestable || update.isPending}
            id={`quantity-${item.product.slug}`}
            max={1000}
            min={1}
            onChange={(event) => setQuantity(event.currentTarget.valueAsNumber)}
            type="number"
            value={Number.isNaN(quantity) ? '' : quantity}
          />
          <button
            aria-label={`Increase desired quantity for ${item.product.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            disabled={
              !item.product.requestable || quantity >= 1000 || update.isPending
            }
            onClick={() => void save(quantity + 1)}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            className="rounded-lg px-3 py-2 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={!item.product.requestable || update.isPending}
            type="submit"
          >
            Save quantity
          </button>
          <button
            aria-label={`Remove ${item.product.name} from cart`}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
            disabled={remove.isPending}
            onClick={async () => {
              setMessage('');
              try {
                await remove.mutateAsync(item.product.slug);
                setMessage(`${item.product.name} removed from your cart.`);
              } catch (error) {
                setMessage(
                  error instanceof Error ? error.message : 'Remove failed.',
                );
              }
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Remove
          </button>
        </div>
        <p aria-live="polite" className="min-h-5 text-xs text-muted-foreground">
          {message}
        </p>
      </form>
    </li>
  );
}

export function RentalCart() {
  const cart = useCart();
  const clear = useClearCart();
  const dialog = useRef<HTMLDialogElement>(null);
  const [clearMessage, setClearMessage] = useState('');

  if (cart.isPending)
    return (
      <div
        aria-busy="true"
        className="rounded-3xl border border-border bg-card p-10 text-center"
      >
        <RefreshCw
          aria-hidden="true"
          className="mx-auto h-8 w-8 animate-spin text-primary"
        />
        <p className="mt-4 font-semibold">Loading your rental cart…</p>
      </div>
    );
  if (cart.isError)
    return (
      <div
        role="alert"
        className="rounded-3xl border border-border bg-card p-10 text-center"
      >
        <AlertCircle
          aria-hidden="true"
          className="mx-auto h-9 w-9 text-red-700 dark:text-red-300"
        />
        <h2 className="mt-4 text-xl font-semibold">Your cart could not load</h2>
        <button
          className="mt-5 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground"
          onClick={() => void cart.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  if (!cart.data.items.length)
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center sm:p-14">
        <PackageOpen
          aria-hidden="true"
          className="mx-auto h-10 w-10 text-primary"
        />
        <h2 className="mt-4 text-2xl font-semibold">
          Your rental cart is empty
        </h2>
        <p className="mx-auto mt-2 max-w-lg leading-7 text-muted-foreground">
          Browse the catalogue and choose the quantities your project needs. No
          account is required to prepare a guest cart.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          href="/rentals"
        >
          <ShoppingBag aria-hidden="true" className="h-4 w-4" />
          Browse equipment
        </Link>
      </div>
    );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div>
        <ul className="grid gap-4">
          {cart.data.items.map((item) => (
            <CartLine item={item} key={item.product.slug} />
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            className="rounded-lg px-4 py-3 font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            href="/rentals"
          >
            Continue browsing
          </Link>
          <button
            className="inline-flex items-center gap-2 rounded-lg px-4 py-3 font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring dark:text-red-300 dark:hover:bg-red-950/30"
            onClick={() => {
              setClearMessage('');
              dialog.current?.showModal();
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Clear cart
          </button>
        </div>
      </div>
      <aside className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:sticky xl:top-24">
        <h2 className="text-xl font-semibold">Cart summary</h2>
        <dl className="mt-5 grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Equipment types</dt>
            <dd className="font-semibold">{cart.data.distinctItemCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Total desired units</dt>
            <dd className="font-semibold">{cart.data.desiredUnitCount}</dd>
          </div>
        </dl>
        <div className="mt-6 rounded-xl bg-accent p-4 text-sm leading-6 text-accent-foreground">
          Adding items does not reserve equipment. Staff will privately review
          supply after a rental request is submitted in the next development
          phase.
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Rental dates, project details, contact information, and request
          submission are intentionally introduced in Phase 8.
        </p>
      </aside>

      <dialog
        aria-labelledby="clear-cart-title"
        className="w-[min(30rem,calc(100%-2rem))] rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60"
        ref={dialog}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold" id="clear-cart-title">
            Clear your rental cart?
          </h2>
          <p className="mt-2 leading-6 text-muted-foreground">
            This removes every selected product and desired quantity from this
            browser.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              className="rounded-lg border border-border px-4 py-2.5 font-semibold"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              disabled={clear.isPending}
              onClick={async () => {
                setClearMessage('');
                try {
                  await clear.mutateAsync();
                  dialog.current?.close();
                } catch (error) {
                  setClearMessage(
                    error instanceof Error ? error.message : 'Clear failed.',
                  );
                }
              }}
              type="button"
            >
              {clear.isPending ? 'Clearing…' : 'Clear cart'}
            </button>
          </div>
          <p
            aria-live="polite"
            className="mt-3 min-h-5 text-sm text-red-700 dark:text-red-300"
          >
            {clearMessage}
          </p>
        </div>
      </dialog>
    </div>
  );
}
