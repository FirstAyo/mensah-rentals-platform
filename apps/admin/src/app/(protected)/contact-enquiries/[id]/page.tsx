import { ContactEnquiryDetail } from '@/components/contact-enquiry-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function ContactEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('contact_enquiry.view');
  return (
    <ContactEnquiryDetail
      canManage={user.permissionKeys.includes('contact_enquiry.manage')}
      id={(await params).id}
    />
  );
}
