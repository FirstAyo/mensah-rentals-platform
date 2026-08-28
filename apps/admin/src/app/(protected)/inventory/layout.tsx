import type { ReactNode } from 'react';
import { AdminFeatureBoundary } from '@/components/admin-feature-boundary';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminFeatureBoundary
      featureKey="INVENTORY_TRACKING"
      label="Inventory Tracking"
      permission="inventory.view"
    >
      {children}
    </AdminFeatureBoundary>
  );
}
