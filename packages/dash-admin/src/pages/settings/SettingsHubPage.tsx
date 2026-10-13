import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getSystemStatus } from '@roam/dash-admin-client';
import { ConsumerSegmentSettingsShell } from '@roam/admin-core/settings';
import { API_ENDPOINTS } from '@roam/api-client';
import { getJwtRoles } from '@roam/auth-client';
import { useUrlParam, useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { DashPlayStoreLaunchPage } from '../PlayStoreLaunchPage';
import type { AdminOutletContext } from '../../DashAdminPortal';

const TABS = ['general', 'registration', 'announcements', 'security', 'app-releases', 'system'] as const;
const SETTINGS = ['general', 'registration', 'announcements', 'security'] as const;

export function SettingsHubPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const roles = getJwtRoles(session.user);
  const canSeeSystem = roles.some((role) => role === 'platform_owner' || role === 'superadmin' || role === 'dash_admin');
  const [tab, setTab] = useUrlTab('general', TABS);
  const [scope, setScope] = useUrlParam('scope', 'rush', ['rush', 'courier'] as const);
  const [system, setSystem] = useState<Awaited<ReturnType<typeof getSystemStatus>> | null>(null);

  useEffect(() => {
    if (tab !== 'system' || !canSeeSystem) return;
    void getSystemStatus(session.access_token).then(setSystem).catch(() => setSystem(null));
  }, [tab, canSeeSystem, session.access_token]);

  const settingsTab = (SETTINGS as readonly string[]).includes(tab) ? tab : 'general';
  const showScope = tab !== 'app-releases' && tab !== 'system';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="How Rush and the courier app behave."
        actions={showScope ? (
          <div className="flex gap-1 rounded-lg border border-slate-800 p-1">
            {(['rush', 'courier'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setScope(item)} className={`px-3 py-1 rounded-md text-sm ${scope === item ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400'}`}>
                {item === 'rush' ? 'Rush' : 'Courier'}
              </button>
            ))}
          </div>
        ) : null}
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'registration', label: 'Registration' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'security', label: 'Security' },
          { id: 'app-releases', label: 'App releases' },
          ...(canSeeSystem ? [{ id: 'system', label: 'System' }] : []),
        ]}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'app-releases' ? <DashPlayStoreLaunchPage /> : null}
      {tab === 'system' ? (
        <div className="space-y-3 text-sm text-slate-300">
          {(system?.flags ?? []).map((flag) => (
            <p key={flag.name}>{flag.name}: {flag.on ? 'on' : 'off'}</p>
          ))}
          {(system?.integrations ?? []).map((item) => (
            <p key={item.name}>{item.name}: {item.state}</p>
          ))}
          {!system && <p className="text-slate-500">System status is not available.</p>}
        </div>
      ) : null}
      {(SETTINGS as readonly string[]).includes(tab) ? (
        <ConsumerSegmentSettingsShell
          key={scope}
          segment={scope === 'courier' ? 'courier' : 'dash'}
          apiBaseUrl={API_ENDPOINTS.admin}
          accessToken={session.access_token}
          userEmail={session.user.email}
          activeTab={settingsTab}
          onTabChange={(id) => setTab(id as typeof TABS[number])}
          hideTabs
        />
      ) : null}
    </div>
  );
}
