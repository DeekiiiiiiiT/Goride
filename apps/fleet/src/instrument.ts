import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

// Init before app code loads. No-op when DSN is missing (local without .env).
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // 100% in early setup; drop to 0.1–0.2 once traffic grows in production.
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    // Do NOT include supabase.co — Sentry would inject sentry-trace/baggage on
    // cross-origin API calls and Supabase CORS rejects those → "Failed to fetch"
    // (looks like an empty fleet / wiped data). Same-origin only.
    tracePropagationTargets: ['localhost', /^\//],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
  });
}
