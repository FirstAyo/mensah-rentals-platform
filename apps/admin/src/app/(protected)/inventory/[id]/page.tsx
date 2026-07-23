import { InventoryDetail } from '@/components/inventory-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('inventory.view');
  const { id } = await params;
  return (
    <InventoryDetail
      id={id}
      canAdjust={user.permissionKeys.includes('inventory.adjust')}
      canViewHistory={
        user.permissionKeys.includes('inventory.transaction.view') &&
        user.permissionKeys.includes('inventory.quantity.view')
      }
      canViewQuantity={user.permissionKeys.includes('inventory.quantity.view')}
    />
  );
}
