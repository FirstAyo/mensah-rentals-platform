import { resolve } from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: resolve(process.cwd(), '../..'),
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
    return [{ source: '/media/:path*', destination: `${api}/media/:path*` }];
  },
};

export default nextConfig;
