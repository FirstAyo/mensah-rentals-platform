import type { ReactNode } from 'react';
import { AdminFeatureBoundary } from '@/components/admin-feature-boundary';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminFeatureBoundary
      featureKey="FULFILMENT"
      label="Fulfilment"
      permission="active_rental.view"
    >
      {children}
    </AdminFeatureBoundary>
  );
}
