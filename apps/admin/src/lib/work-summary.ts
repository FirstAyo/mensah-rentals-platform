'use client';

import type { AdminWorkSummaryResponse } from '@mensah-rentals/types';
import { useCallback, useEffect, useState } from 'react';

export const WORK_SUMMARY_INVALIDATED = 'mensah:work-summary-invalidated';

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSummary(value: unknown): value is AdminWorkSummaryResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.generatedAt !== 'string') return false;
  const requests = record.rentalRequests as Record<string, unknown> | undefined;
  const quotes = record.quotes as Record<string, unknown> | undefined;
  const orders = record.orders as Record<string, unknown> | undefined;
  const reservations = record.reservations as
    | Record<string, unknown>
    | undefined;
  return (
    (!requests ||
      (count(requests.submittedAwaitingReview) &&
        count(requests.underReview) &&
        (requests.approvedAwaitingQuote === undefined ||
          count(requests.approvedAwaitingQuote)))) &&
    (!quotes ||
      (count(quotes.sentAwaitingResponse) &&
        (quotes.acceptedAwaitingOrder === undefined ||
          count(quotes.acceptedAwaitingOrder)))) &&
    (!orders ||
      ((orders.confirmedNotReserved === undefined ||
        count(orders.confirmedNotReserved)) &&
        count(orders.upcomingRentalDates))) &&
    (!reservations ||
      (count(reservations.awaitingReservation) &&
        count(reservations.fullyReserved) &&
        count(reservations.partiallyReserved) &&
        count(reservations.unresolvedShortfallQuantity) &&
        count(reservations.upcomingReservations)))
  );
}

export function invalidateWorkSummary() {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(WORK_SUMMARY_INVALIDATED));
}

export function useWorkSummary(enabled = true) {
  const [data, setData] = useState<AdminWorkSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const refresh = useCallback(async () => {
    if (!enabled || document.visibilityState === 'hidden') return;
    try {
      const response = await fetch('/api/work-summary', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      if (!isSummary(body)) throw new Error();
      setData(body);
      setError(null);
    } catch {
      setError('Work summary is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 45_000);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener(WORK_SUMMARY_INVALIDATED, onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(WORK_SUMMARY_INVALIDATED, onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, refresh]);

  return { data, error, loading, refresh };
}
