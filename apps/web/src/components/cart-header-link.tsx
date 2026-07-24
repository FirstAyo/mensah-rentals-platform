'use client';

import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useCart } from '@/lib/use-cart';

export function CartHeaderLink() {
  const cart = useCart();
  const count = cart.data?.distinctItemCount ?? 0;
  return (
    <Link
      aria-label={`Rental cart, ${count} equipment ${count === 1 ? 'type' : 'types'}`}
      className="relative inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-3"
      href="/cart"
    >
      <ShoppingCart aria-hidden="true" className="h-5 w-5" />
      <span className="hidden lg:inline">Cart</span>
      {count > 0 ? (
        <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
