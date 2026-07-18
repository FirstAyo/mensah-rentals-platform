import { resolve } from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: resolve(process.cwd(), '../..'),
  },
};

export default nextConfig;
