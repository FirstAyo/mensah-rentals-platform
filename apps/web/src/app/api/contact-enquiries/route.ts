import { proxyContactEnquiry } from '@/lib/contact-enquiry-proxy';

export async function POST(request: Request): Promise<Response> {
  return proxyContactEnquiry(request);
}
