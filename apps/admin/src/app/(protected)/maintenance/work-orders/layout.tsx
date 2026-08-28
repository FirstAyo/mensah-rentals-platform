import type { ReactNode } from 'react';
import { AdminFeatureBoundary } from '@/components/admin-feature-boundary';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminFeatureBoundary
      featureKey="MAINTENANCE"
      label="Maintenance"
      permission="maintenance.view"
    >
      {children}
    </AdminFeatureBoundary>
  );
}
