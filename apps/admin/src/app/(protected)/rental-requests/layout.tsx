import type { ReactNode } from 'react';
import { AdminFeatureBoundary } from '@/components/admin-feature-boundary';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminFeatureBoundary
      featureKey="RENTAL_REQUESTS"
      label="Rental Requests"
      permission="rental_request.view"
    >
      {children}
    </AdminFeatureBoundary>
  );
}
