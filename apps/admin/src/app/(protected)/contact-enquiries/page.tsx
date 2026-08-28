import { ContactEnquiryList } from '@/components/contact-enquiry-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function ContactEnquiriesPage() {
  await requireStaffPermission('contact_enquiry.view');
  return <ContactEnquiryList />;
}
