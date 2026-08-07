import './instrument';

import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { initPortalTheme } from './hooks/usePortalTheme';
import './index.css';

initPortalTheme();

const rootEl = document.getElementById('root')!;

/** Vite can briefly fail first-paint dynamic imports during HMR / restart. */
async function importApp(retries = 3): Promise<typeof import('./App')> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await import('./App');
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function isLocalViteModuleFetchError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message;
  return (
    /Failed to fetch dynamically imported module/i.test(msg) &&
    /localhost|127\.0\.0\.1/i.test(msg)
  );
}

try {
  // Dynamic import so a missing VITE_SUPABASE_* config shows a message instead of a blank page
  const { default: App } = await importApp();
  createRoot(rootEl).render(
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
      <App />
    </Sentry.ErrorBoundary>,
  );
} catch (err) {
  // Local Vite blips are not product bugs — only report real boot failures.
  if (!isLocalViteModuleFetchError(err)) {
    Sentry.captureException(err);
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error('[Admin boot]', err);
  rootEl.innerHTML = `
    <div style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:1.5rem;border:1px solid #fecaca;background:#fef2f2;border-radius:0.75rem;color:#991b1b">
      <h1 style="font-size:1.125rem;font-weight:600;margin:0 0 0.5rem">Admin failed to start</h1>
      <p style="margin:0 0 0.75rem;font-size:0.875rem;line-height:1.5">${message.replace(/</g, '&lt;')}</p>
      <p style="margin:0;font-size:0.8rem;color:#7f1d1d">
        Create <code>apps/admin/.env.local</code> with <code>VITE_SUPABASE_URL</code> and
        <code>VITE_SUPABASE_ANON_KEY</code> (same values as Fleet), then stop and restart
        <code>npm run dev</code> in <code>apps/admin</code>.
      </p>
    </div>
  `;
}
