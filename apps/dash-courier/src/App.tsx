import React from 'react';
import { AuthRecoveryGate } from '@roam/auth-client';
import { CourierConsumerApp } from '@/CourierConsumerApp';
import CourierAdminRemovedPage from './pages/CourierAdminRemovedPage';

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');

  if (isAdmin) {
    return <CourierAdminRemovedPage />;
  }

  return (
    <AuthRecoveryGate
      title="Reset password"
      subtitle="Roam Rush Courier"
      signInHref="/"
    >
      <CourierConsumerApp />
    </AuthRecoveryGate>
  );
}
