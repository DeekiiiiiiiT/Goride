import React from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './components/dashboard/Dashboard';

export default function App() {
  return (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  );
}
