import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthRecoveryGate } from '@roam/auth-client';
import { CourierConsumerApp } from '@/CourierConsumerApp';
import { CourierAdminPortal } from '@/admin/CourierAdminPortal';

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');

  return (
    <AuthRecoveryGate
      title="Reset password"
      subtitle={isAdmin ? 'Roam Dash Courier Admin' : 'Roam Dash Courier'}
      signInHref={isAdmin ? '/admin' : '/'}
    >
      {isAdmin ? (
        <BrowserRouter basename="/admin">
          <CourierAdminPortal />
        </BrowserRouter>
      ) : (
        <CourierConsumerApp />
      )}
    </AuthRecoveryGate>
  );
}
