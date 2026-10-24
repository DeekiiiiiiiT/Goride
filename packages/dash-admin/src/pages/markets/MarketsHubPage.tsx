import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { listMarkets, type DashParishRow } from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import { useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { PlatformExclusionsPanel } from './PlatformExclusionsPanel';
import type { AdminOutletContext } from '../../DashAdminPortal';

const TABS = ['markets', 'exclusions', 'health'] as const;

export function MarketsHubPage({
  markets,
  health,
}: {
  markets: ReactNode;
  health: ReactNode;
}) {
  const [tab, setTab] = useUrlTab('markets', TABS);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Markets"
        description="Where Rush delivers, and where it does not."
        tabs={[
          { id: 'markets', label: 'Markets' },
          { id: 'exclusions', label: 'Exclusion zones' },
          { id: 'health', label: 'Health' },
        ]}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'exclusions' ? <ExclusionsTab /> : null}
      {tab === 'health' ? health : null}
      {tab === 'markets' ? markets : null}
    </div>
  );
}

function ExclusionsTab() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [parishes, setParishes] = useState<DashParishRow[]>([]);
  useEffect(() => {
    void listMarkets(session.access_token, { includeZones: false })
      .then((res) => setParishes((res.parishes ?? []) as DashParishRow[]))
      .catch(() => setParishes([]));
  }, [session.access_token]);
  return (
    <PlatformExclusionsPanel
      accessToken={session.access_token}
      parishes={parishes}
      canWrite={canWriteDashAdmin(session.user)}
    />
  );
}
