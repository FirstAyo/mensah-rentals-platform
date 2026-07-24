import type { MetadataRoute } from 'next';
import { indexingEnabled, siteOrigin } from '@/lib/site-config';
export default function robots(): MetadataRoute.Robots {
  return indexingEnabled()
    ? {
        rules: [
          {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin', '/login', '/account', '/cart', '/api'],
          },
        ],
        sitemap: `${siteOrigin()}/sitemap.xml`,
      }
    : { rules: { userAgent: '*', disallow: '/' } };
}
