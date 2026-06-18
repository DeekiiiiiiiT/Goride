import React from 'react';
import { ConsumerSegmentSettingsShell } from '@roam/admin-core/settings';
import { API_ENDPOINTS } from '@roam/api-client';
import type { Session } from '@supabase/supabase-js';

type PlatformSettingsPageProps = {
  session: Session;
};

export function PlatformSettingsPage({ session }: PlatformSettingsPageProps) {
  return (
    <ConsumerSegmentSettingsShell
      segment="dash"
      apiBaseUrl={API_ENDPOINTS.admin}
      accessToken={session.access_token}
      userEmail={session.user.email}
    />
  );
}
