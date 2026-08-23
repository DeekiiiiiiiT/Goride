import React, { useMemo } from 'react';
import { ConsumerSegmentSettingsShell } from '@roam/admin-core/settings';
import { API_ENDPOINTS } from '@roam/api-client';
import { jwtPrimaryRole } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';
import { SegmentTabs } from '../components/SegmentTabs';
import { isCourierOnlyRole } from '../utils/isCourierOnlyRole';

type SettingsTab = 'rush' | 'courier';

type PlatformSettingsPageProps = {
  session: Session;
};

export function PlatformSettingsPage({ session }: PlatformSettingsPageProps) {
  const role = jwtPrimaryRole(session.user);
  const courierOnly = isCourierOnlyRole(role);

  const tabs = useMemo(() => {
    if (courierOnly) return [{ id: 'courier' as const, label: 'Courier' }];
    return [
      { id: 'rush' as const, label: 'Rush' },
      { id: 'courier' as const, label: 'Courier' },
    ];
  }, [courierOnly]);

  const [activeTab, setActiveTab] = React.useState<SettingsTab>(tabs[0]?.id ?? 'rush');

  React.useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? 'rush');
    }
  }, [activeTab, tabs]);

  const segment = activeTab === 'courier' ? 'courier' : 'dash';

  return (
    <div>
      <SegmentTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <ConsumerSegmentSettingsShell
        key={segment}
        segment={segment}
        apiBaseUrl={API_ENDPOINTS.admin}
        accessToken={session.access_token}
        userEmail={session.user.email}
      />
    </div>
  );
}
