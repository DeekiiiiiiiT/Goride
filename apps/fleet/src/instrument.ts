import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

/** Dev-only Vite HMR / dual-React blips — not product regressions. */
const localDevNoise = [
  /Failed to fetch dynamically imported module:.*(?:localhost|127\.0\.0\.1)/i,
  /Cannot read properties of null \(reading 'useState'\)/,
  /Invalid hook call/,
];

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
    // Do NOT include supabase.co — Sentry injects sentry-trace/baggage on those
    // cross-origin calls and Supabase CORS rejects them → "Failed to fetch"
    // (blank dashboard / login broken). Same-origin only.
    tracePropagationTargets: ['localhost', /^\//],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    ignoreErrors: import.meta.env.DEV ? localDevNoise : [],
  });
}
