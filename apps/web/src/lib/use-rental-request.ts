'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubmitRentalRequestInput } from '@mensah-rentals/validation';

import { cartQueryKey } from './use-cart';
import {
  submitRentalRequest,
  trackRentalRequest,
} from './rental-request-client';

export function useSubmitRentalRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitRentalRequestInput) => submitRentalRequest(input),
    onSuccess: () =>
      client.setQueryData(cartQueryKey, {
        desiredUnitCount: 0,
        distinctItemCount: 0,
        items: [],
      }),
  });
}

export function useTrackedRentalRequest(referenceNumber: string) {
  return useQuery({
    queryKey: ['public-rental-request', referenceNumber],
    queryFn: () => trackRentalRequest(referenceNumber),
    retry: false,
  });
}
