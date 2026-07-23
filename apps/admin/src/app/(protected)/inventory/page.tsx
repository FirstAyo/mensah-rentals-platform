import { InventoryList } from '@/components/inventory-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function InventoryPage() {
  const user = await requireStaffPermission('inventory.view');
  return (
    <InventoryList
      canAdjust={user.permissionKeys.includes('inventory.adjust')}
      canViewQuantity={user.permissionKeys.includes('inventory.quantity.view')}
    />
  );
}
