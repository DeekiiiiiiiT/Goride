import * as Sentry from '@sentry/capacitor';
import { init as sentryReactInit, browserTracingIntegration, replayIntegration } from '@sentry/react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const dsn = import.meta.env.VITE_SENTRY_DSN;

/** Written by MainActivity when the WebView renderer dies; reported on next boot. */
export const WEBVIEW_RENDER_GONE_PREF = 'webview_render_process_gone';

/** Dev-only Vite HMR blips — not product regressions. */
const localDevNoise = [
  /Failed to fetch dynamically imported module:.*(?:localhost|127\.0\.0\.1)/i,
  /Cannot read properties of null \(reading 'useState'\)/,
  /Invalid hook call/,
  /Should have a queue\. This is likely a bug in React/,
];

// Init before app code loads. No-op when DSN is missing.
if (dsn) {
  // CapacitorOptions is a subset; replay sample rates are sibling (@sentry/react) options.
  Sentry.init(
    {
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION,
      enableNative: true,
      enableNativeCrashHandling: true,
      integrations: [
        browserTracingIntegration(),
        replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
      // Do NOT include supabase.co - Sentry would inject sentry-trace/baggage on
      // cross-origin API calls and Supabase CORS rejects those ("Failed to fetch").
      tracePropagationTargets: ['localhost', /^\//],
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      ignoreErrors: import.meta.env.DEV ? localDevNoise : [],
    } as Parameters<typeof Sentry.init>[0],
    sentryReactInit,
  );
}

/**
 * OS memory kills are already recovered by MainActivity.recreate().
 * Only a real renderer crash should open a Sentry error.
 * Returns null when there is nothing to report.
 */
export function webViewGoneReportLevel(raw: string): 'error' | null {
  return String(raw).includes('crash') ? 'error' : null;
}

/** Report a prior WebView renderer death (flag set by MainActivity SharedPreferences). */
export async function reportPriorWebViewCrashIfAny(): Promise<void> {
  if (!dsn || !Capacitor.isNativePlatform()) return;
  try {
    const { value } = await Preferences.get({ key: WEBVIEW_RENDER_GONE_PREF });
    if (!value) return;
    await Preferences.remove({ key: WEBVIEW_RENDER_GONE_PREF });
    const level = webViewGoneReportLevel(value);
    if (!level) return;
    Sentry.withScope((scope) => {
      scope.setLevel(level);
      scope.setTag('platform', Capacitor.getPlatform());
      scope.setTag('didCrash', 'true');
      scope.setExtra('raw', value);
      Sentry.captureMessage('webview_render_process_gone');
    });
  } catch {
    /* Preferences unavailable in some web shells */
  }
}
