import type { ReactNode } from 'react';
import { AdminFeatureBoundary } from '@/components/admin-feature-boundary';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminFeatureBoundary
      featureKey="DAMAGED_RETURN_HANDLING"
      label="Damaged Return Handling"
      permission="rental_issue.view"
    >
      {children}
    </AdminFeatureBoundary>
  );
}
