import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (!SENTRY_DSN) {
  export {};
} else {
  Sentry.init({
    dsn: SENTRY_DSN,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out sensitive financial data from breadcrumbs
  beforeBreadcrumb(breadcrumb) {
    // Redact invoice amounts, wallet addresses, and transaction data
    if (breadcrumb.category === 'console' || breadcrumb.category === 'fetch') {
      if (breadcrumb.data?.url?.includes('/invoices/') || 
          breadcrumb.data?.url?.includes('/contract')) {
        breadcrumb.data = { ...breadcrumb.data, redacted: true };
      }
      if (breadcrumb.message) {
        // Redact potential Stellar addresses (G... format)
        breadcrumb.message = breadcrumb.message.replace(/G[A-Z0-9]{55}/g, '[REDACTED_ADDRESS]');
        // Redact potential contract IDs (C... format)
        breadcrumb.message = breadcrumb.message.replace(/C[A-Z0-9]{55}/g, '[REDACTED_CONTRACT]');
      }
    }
    return breadcrumb;
  },
  });
}
