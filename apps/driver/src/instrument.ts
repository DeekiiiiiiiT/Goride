import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

// Init before app code loads. No-op when DSN is missing.
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
        tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    // Do NOT include supabase.co — Sentry injects sentry-trace/baggage on those
    // cross-origin calls and Supabase CORS rejects them → "Failed to fetch".
    tracePropagationTargets: ['localhost', /^\//],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
  });
}
