'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicCartResponse } from '@mensah-rentals/types';
import { clearCart, getCart, removeCartItem, setCartItem } from './cart-client';

export const cartQueryKey = ['public-rental-cart'] as const;

export function useCart() {
  return useQuery({ queryKey: cartQueryKey, queryFn: getCart });
}

function useCartMutation<T>(
  mutationFn: (value: T) => Promise<PublicCartResponse>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (cart) => client.setQueryData(cartQueryKey, cart),
  });
}

export function useSetCartItem() {
  return useCartMutation(
    (value: { productSlug: string; desiredQuantity: number }) =>
      setCartItem(value.productSlug, value.desiredQuantity),
  );
}

export function useRemoveCartItem() {
  return useCartMutation((productSlug: string) => removeCartItem(productSlug));
}

export function useClearCart() {
  const client = useQueryClient();
  return useMutation<PublicCartResponse, Error, void>({
    mutationFn: clearCart,
    onSuccess: (cart) => client.setQueryData(cartQueryKey, cart),
  });
}
