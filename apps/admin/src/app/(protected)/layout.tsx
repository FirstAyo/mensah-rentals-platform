import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { requireCurrentStaffUser } from '@/lib/auth-server';
import { getAdminFeatureAvailability } from '@/lib/feature-settings-server';

export const dynamic = 'force-dynamic';
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentStaffUser();
  const featureAvailability = await getAdminFeatureAvailability();
  return (
    <AdminShell featureAvailability={featureAvailability} user={user}>
      {children}
    </AdminShell>
  );
}
