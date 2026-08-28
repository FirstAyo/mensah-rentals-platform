import type { ReactNode } from 'react';
import { AdminFeatureBoundary } from '@/components/admin-feature-boundary';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminFeatureBoundary
      featureKey="OPERATIONAL_REPORTING"
      label="Operational Reporting"
      permission="report.view"
    >
      {children}
    </AdminFeatureBoundary>
  );
}
