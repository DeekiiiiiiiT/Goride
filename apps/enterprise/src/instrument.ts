import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

/** Dev-only Vite HMR / dual-React blips ? not product regressions. */
const localDevNoise = [
  /Failed to fetch dynamically imported module:.*(?:localhost|127\.0\.0\.1)/i,
  /Cannot read properties of null \(reading 'useState'\)/,
  /Invalid hook call/,
  /BridgedUserManagementPage is not defined/,
  /WarehouseInboundPage is not defined/,
  /DispatchBoardPage is not defined/,
  /hasInvoice is not defined/,
  /useAuth must be used within AuthProvider/,
];

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
    // Do NOT include supabase.co - Sentry would inject sentry-trace/baggage on
    // cross-origin API calls and Supabase CORS rejects those ("Failed to fetch").
    // Same-origin only.
    tracePropagationTargets: ['localhost', /^\//],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    ignoreErrors: import.meta.env.DEV ? localDevNoise : [],
  });
}
