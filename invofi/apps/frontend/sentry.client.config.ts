import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'console' || breadcrumb.category === 'fetch') {
      if (breadcrumb.data?.url?.includes('/invoices/') || 
          breadcrumb.data?.url?.includes('/contract')) {
        breadcrumb.data = { ...breadcrumb.data, redacted: true };
      }
      if (breadcrumb.message) {
        breadcrumb.message = breadcrumb.message.replace(/G[A-Z0-9]{55}/g, '[REDACTED_ADDRESS]');
        breadcrumb.message = breadcrumb.message.replace(/C[A-Z0-9]{55}/g, '[REDACTED_CONTRACT]');
      }
    }
    return breadcrumb;
  },
});
