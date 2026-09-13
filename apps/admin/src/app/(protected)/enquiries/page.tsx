import { CartEnquiryList } from '@/components/cart-enquiry-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function CartEnquiriesPage() {
  await requireStaffPermission('cart_enquiry.view');
  return <CartEnquiryList />;
}
