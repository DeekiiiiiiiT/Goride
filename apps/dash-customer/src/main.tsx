import './instrument';

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import { initRushNative } from './capacitor-native';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

void initRushNative().finally(() => {
  // Admin portal mounts its own Sonner <Toaster>; skip here so /admin toasts aren't doubled.
  const isAdminShell = window.location.pathname.startsWith('/admin');

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Sentry.ErrorBoundary
        fallback={({ error }) => (
          <div style={{ fontFamily: 'system-ui,sans-serif', maxWidth: '36rem', margin: '4rem auto', padding: '1.5rem' }}>
            <p>Something went wrong. Please refresh the page.</p>
            {error instanceof Error && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#991b1b' }}>{error.message}</p>
            )}
          </div>
        )}
      >
        <QueryClientProvider client={queryClient}>
          <App />
          {!isAdminShell ? (
            <Toaster position="top-center" richColors offset="max(12px, env(safe-area-inset-top))" />
          ) : null}
        </QueryClientProvider>
      </Sentry.ErrorBoundary>
    </React.StrictMode>,
  );
});
