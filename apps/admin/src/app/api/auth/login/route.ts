import { proxyAuthPost } from '@/lib/auth-proxy';

export function POST(request: Request): Promise<Response> {
  return proxyAuthPost(request, '/auth/login');
}
