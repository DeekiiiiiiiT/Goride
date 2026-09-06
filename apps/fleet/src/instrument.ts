import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;
const isDev = import.meta.env.DEV;

/** Dev-only Vite HMR / dual-React blips — not product regressions. */
const localDevNoise = [
  /Failed to fetch dynamically imported module:.*(?:localhost|127\.0\.0\.1)/i,
  /Cannot read properties of null \(reading 'useState'\)/,
  /Invalid hook call/,
  // Fast Refresh remounts leave TDZ / unbound identifiers mid-edit (ROAM-FLEET-1*).
  /Cannot access '.+' before initialization/,
  /Should have a queue\. This is likely a bug in React/,
  / is not defined$/,
];

function eventLooksLikeViteHmr(event: Sentry.ErrorEvent): boolean {
  const frames =
    event.exception?.values?.flatMap((v) => v.stacktrace?.frames ?? []) ?? [];
  return frames.some((f) => {
    const file = f.filename || '';
    const fn = f.function || '';
    return (
      file.includes('@react-refresh') ||
      file.includes('/@vite/') ||
      fn.includes('performReactRefresh') ||
      fn.includes('scheduleRefresh')
    );
  });
}

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
    // Prod: sample. Dev: keep a trickle for real crashes — not 100% HMR noise.
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 0.05,
    // Do NOT include supabase.co — Sentry injects sentry-trace/baggage on those
    // cross-origin calls and Supabase CORS rejects them → "Failed to fetch"
    // (blank dashboard / login broken). Same-origin only.
    tracePropagationTargets: ['localhost', /^\//],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    ignoreErrors: isDev ? localDevNoise : [],
    beforeSend(event) {
      if (isDev && eventLooksLikeViteHmr(event)) return null;
      return event;
    },
  });
}
