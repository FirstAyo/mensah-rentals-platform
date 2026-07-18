import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { requireCurrentStaffUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentStaffUser();
  return <AdminShell user={user}>{children}</AdminShell>;
}
