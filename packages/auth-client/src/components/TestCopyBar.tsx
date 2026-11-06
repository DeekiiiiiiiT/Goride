import React from 'react';

export function isLocalSupabaseUrl(url: string | undefined): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw.replace(/\/$/, '')).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

/** Fixed banner when the app points at local Supabase (test copy). */
export function TestCopyBar() {
  if (!isLocalSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)) {
    return null;
  }

  return (
    <>
      <div
        role="status"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100000,
          background: '#ea580c',
          color: '#fff',
          textAlign: 'center',
          fontSize: '0.875rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          padding: '0.35rem 0.75rem',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}
      >
        TEST COPY — not your real data
      </div>
      <div aria-hidden style={{ height: '2rem', flexShrink: 0 }} />
    </>
  );
}
