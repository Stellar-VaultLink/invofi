import type { MetadataRoute } from 'next';

/**
 * Robots.txt — tells crawlers what to index and what to ignore.
 *
 * Public pages (landing, marketplace, stats, auth) are allowed.
 * Authenticated pages (dashboard, portfolio, invoices, settings, profile,
 * transactions) and utility routes (403, print) are disallowed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/marketplace', '/marketplace/positions', '/stats', '/contracts'],
      disallow: [
        '/dashboard/',
        '/invoices/',
        '/portfolio/',
        '/profile/',
        '/settings/',
        '/transactions/',
        '/auth/',
        '/403/',
      ],
    },
    sitemap: 'https://invofi-five.vercel.app/sitemap.xml',
  };
}
