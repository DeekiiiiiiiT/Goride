import React from 'react';
import { ConsumerSegmentSettingsShell } from '@roam/admin-core/settings';
import { API_ENDPOINTS } from '@roam/api-client';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

type AdminContext = { session: Session };

export function PlatformSettingsPage() {
  const { session } = useOutletContext<AdminContext>();

  return (
    <ConsumerSegmentSettingsShell
      segment="driver"
      apiBaseUrl={API_ENDPOINTS.admin}
      accessToken={session.access_token}
      userEmail={session.user.email}
    />
  );
}
