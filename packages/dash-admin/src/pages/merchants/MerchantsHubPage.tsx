import { useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { MerchantManager } from '../MerchantManager';
import { BusinessTypesPage } from './onboarding/BusinessTypesPage';

const TABS = ['directory', 'applications', 'business-types'] as const;

export function MerchantsHubPage() {
  const [tab, setTab] = useUrlTab('directory', TABS);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Merchants"
        description="Live restaurants, and the applications still waiting on a person."
        tabs={[
          { id: 'directory', label: 'Directory' },
          { id: 'applications', label: 'Applications' },
          { id: 'business-types', label: 'Business types' },
        ]}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'business-types' ? <BusinessTypesPage embedded /> : null}
      {tab === 'applications' ? <MerchantManager mode="applications" /> : null}
      {tab === 'directory' ? <MerchantManager mode="directory" /> : null}
    </div>
  );
}
