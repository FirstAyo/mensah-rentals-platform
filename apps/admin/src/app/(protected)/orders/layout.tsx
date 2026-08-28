import type { ReactNode } from 'react';
import { AdminFeatureBoundary } from '@/components/admin-feature-boundary';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminFeatureBoundary
      featureKey="QUOTES_AND_ORDERS"
      label="Quotes and Orders"
      permission="order.view"
    >
      {children}
    </AdminFeatureBoundary>
  );
}
