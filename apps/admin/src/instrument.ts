import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;
const isDev = import.meta.env.DEV;

/** Dev-only Vite HMR / dual-React blips — not product regressions. */
const localDevNoise = [
  /Failed to fetch dynamically imported module:.*(?:localhost|127\.0\.0\.1)/i,
  /Cannot read properties of null \(reading 'useState'\)/,
  /Invalid hook call/,
  /Cannot access '.+' before initialization/,
  /Should have a queue\. This is likely a bug in React/,
  / is not defined$/,
  /A component suspended while responding to synchronous input/,
  /Unauthorized: No user context/,
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

function spanIsExpectedLargeGeoFetch(span: { description?: string }): boolean {
  const desc = span.description || '';
  return desc.includes('/geo/shapes');
}

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
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 0.05,
    // Do NOT include supabase.co - Sentry would inject sentry-trace/baggage on
    // cross-origin API calls and Supabase CORS rejects those ("Failed to fetch").
    // Same-origin only.
    tracePropagationTargets: ['localhost', /^\//],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    ignoreErrors: isDev ? localDevNoise : [],
    beforeSend(event) {
      if (isDev && eventLooksLikeViteHmr(event)) return null;
      return event;
    },
    beforeSendSpan(span) {
      if (spanIsExpectedLargeGeoFetch(span)) return null as unknown as typeof span;
      return span;
    },
  });
}
