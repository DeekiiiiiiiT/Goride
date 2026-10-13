import { useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { IdentityDirectoryPage } from '../users/IdentityDirectoryPage';
import { ComplianceManager } from './ComplianceManager';

const TABS = ['directory', 'compliance'] as const;

export function CouriersHubPage() {
  const [tab, setTab] = useUrlTab('directory', TABS);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Couriers"
        description="People who deliver, and the documents still waiting."
        tabs={[
          { id: 'directory', label: 'Directory' },
          { id: 'compliance', label: 'Compliance' },
        ]}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'compliance' ? <ComplianceManager embedded /> : <IdentityDirectoryPage lockedPersona="courier" embedded />}
    </div>
  );
}
