import './instrument';

import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </Sentry.ErrorBoundary>,
);
