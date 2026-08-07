import { createRoot } from 'react-dom/client';
import { initPortalTheme } from './hooks/usePortalTheme';
import './index.css';

initPortalTheme();

const rootEl = document.getElementById('root')!;

try {
  // Dynamic import so a missing VITE_SUPABASE_* config shows a message instead of a blank page
  const { default: App } = await import('./App');
  createRoot(rootEl).render(<App />);
} catch (err) {
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
