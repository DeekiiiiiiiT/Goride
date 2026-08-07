import './instrument';

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { NativeNavigationBridge } from './components/NativeNavigationBridge';
import { initCapacitorNative } from './capacitor-native';
import { ThemeProvider } from './contexts/ThemeContext';
import { LocaleProvider } from './contexts/LocaleContext';
import './i18n';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = (
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <LocaleProvider>
              <NativeNavigationBridge />
              <App />
              <Toaster position="top-center" richColors />
            </LocaleProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

void initCapacitorNative().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(root);
});
