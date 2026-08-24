import type { MetadataRoute } from 'next';

const BASE = 'https://invofi-five.vercel.app';

/**
 * InvoFi sitemap — covers every publicly crawlable route.
 *
 * Routes behind auth (dashboard, portfolio, invoices, settings, profile,
 * transactions) are excluded — they should not appear in search results.
 * The /403 page is also excluded.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // ── Public pages (crawlable) ──────────────────────────────────────────
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE}/marketplace`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE}/marketplace/positions`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${BASE}/stats`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE}/contracts`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },

    // ── Auth pages ────────────────────────────────────────────────────────
    {
      url: `${BASE}/auth/register`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/auth/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
