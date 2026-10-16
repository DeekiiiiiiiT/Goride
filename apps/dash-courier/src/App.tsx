import React from 'react';
import { AuthRecoveryGate } from '@roam/auth-client';
import { API_ENDPOINTS } from '@roam/api-client';
import { AppConfigGates, AppConfigProvider } from '@roam/rush-app-config';
import { LocationConsentDialog } from '@/components/permissions/LocationConsentDialog';
import { CourierConsumerApp } from '@/CourierConsumerApp';
import { APP_VERSION } from '@/lib/aboutContent';
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
      <AppConfigProvider
        app="courier"
        deliveryBaseUrl={API_ENDPOINTS.delivery}
        appVersion={APP_VERSION}
      >
        <AppConfigGates app="courier">
          <CourierConsumerApp />
          <LocationConsentDialog />
        </AppConfigGates>
      </AppConfigProvider>
    </AuthRecoveryGate>
  );
}
