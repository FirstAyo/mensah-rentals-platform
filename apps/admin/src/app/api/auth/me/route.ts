import { proxyAuthMe } from '@/lib/auth-proxy';

export function GET(request: Request): Promise<Response> {
  return proxyAuthMe(request);
}
