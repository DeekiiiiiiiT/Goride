import { Suspense, lazy } from 'react';
import { useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { PromotionsPage } from './PromotionsPage';

const PricingHubPage = lazy(() => import('../pricing/PricingHubPage').then((m) => ({ default: m.PricingHubPage })));
const TABS = ['codes', 'rush-pass'] as const;

export function PromotionsHubPage() {
  const [tab, setTab] = useUrlTab('codes', TABS);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Promotions"
        description="Promo codes and Rush Pass."
        tabs={[{ id: 'codes', label: 'Promo codes' }, { id: 'rush-pass', label: 'Rush Pass' }]}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'rush-pass' ? (
        <Suspense fallback={<p className="text-sm text-slate-400">Loading Rush Pass…</p>}>
          <PricingHubPage onlyTab="rush-pass" />
        </Suspense>
      ) : <PromotionsPage embedded />}
    </div>
  );
}
