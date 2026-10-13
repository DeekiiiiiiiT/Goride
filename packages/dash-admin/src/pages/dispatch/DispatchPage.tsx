import { useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { LiveOpsPage } from '../liveops/LiveOpsPage';
import { CourierPresenceManager } from '../couriers/CourierPresenceManager';

const TABS = ['board', 'map'] as const;

export function DispatchPage() {
  const [tab, setTab] = useUrlTab('board', TABS);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Dispatch"
        description="Live orders and where couriers are right now."
        tabs={[{ id: 'board', label: 'Board' }, { id: 'map', label: 'Map' }]}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'map' ? <CourierPresenceManager embedded /> : <LiveOpsPage embedded />}
    </div>
  );
}
