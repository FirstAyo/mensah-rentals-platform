import { CartEnquiryDetail } from '@/components/cart-enquiry-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function CartEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('cart_enquiry.view');
  return (
    <CartEnquiryDetail
      canManage={user.permissionKeys.includes('cart_enquiry.manage')}
      id={(await params).id}
    />
  );
}
